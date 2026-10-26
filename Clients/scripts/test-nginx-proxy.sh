#!/usr/bin/env bash
# Checks that the frontend image's nginx proxies /api and /v1 to the backend.
#
# Builds the "web" stage of Clients/Dockerfile (the production nginx, its env,
# entrypoint script and config template, without the app build) and runs it
# next to a stub backend that answers with what it received. A host proxy that
# sends everything to the frontend container relies on these routes: in
# v2.6.2 they pointed at the container's own localhost, so every /v1 call
# returned 503 on a deployment like that.
#
# It also renders the Ansible host nginx template
# (ansible/templates/verifywise-nginx.conf.j2) and checks its routing,
# headers and error responses, so the two configs cannot drift unnoticed.
#
# Usage, from the repository root: Clients/scripts/test-nginx-proxy.sh
set -euo pipefail

PREFIX="vw-nginx-proxy-test-$$"
NET="$PREFIX-net"
IMAGE="$PREFIX-web"
BASE_IMAGE=$(awk '/^FROM nginx:.* AS web/ {print $2}' Clients/Dockerfile)
FAILURES=0

cleanup() {
  docker ps -aq --filter "name=$PREFIX" | xargs docker rm -f >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "ok   $name"
  else
    echo "FAIL $name"
    echo "     expected: $expected"
    echo "     actual:   $actual"
    FAILURES=$((FAILURES + 1))
  fi
}

# curl inside a container: prints "<status> <body>". The body file is removed
# first, so a failed request prints "000 " instead of an earlier body.
request() {
  local container="$1"
  shift
  docker exec "$container" sh -c \
    'rm -f /tmp/body; s=$(curl -s -o /tmp/body -w "%{http_code}" "$@"); printf "%s %s" "$s" "$(cat /tmp/body 2>/dev/null)"' \
    sh "$@"
}

wait_for_nginx() {
  local container="$1" url="${2:-http://localhost/}"
  for _ in $(seq 1 30); do
    if docker exec "$container" curl -s -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "FAIL $container did not start"
  docker logs "$container" || true
  exit 1
}

# Runs the web image with extra docker-run arguments and waits for it to serve.
start_web() {
  local name="$1"
  shift
  docker run -d --name "$name" --network "$NET" "$@" "$IMAGE" >/dev/null
  wait_for_nginx "$name"
}

docker build --quiet --target web -t "$IMAGE" -f Clients/Dockerfile . >/dev/null
docker network create "$NET" >/dev/null

STUB_CONF='server { listen 3000; default_type text/plain;
  location /api/client-ip { return 200 "xff $http_x_forwarded_for"; }
  location /api/proto { return 200 "proto $http_x_forwarded_proto"; }
  location / { return 200 "backend $request_method $request_uri"; } }'
docker run -d --name "$PREFIX-backend" --network "$NET" --network-alias backend \
  -e STUB_CONF="$STUB_CONF" "$BASE_IMAGE" \
  sh -c 'printf "%s" "$STUB_CONF" > /etc/nginx/conf.d/default.conf && exec nginx -g "daemon off;"' >/dev/null
wait_for_nginx "$PREFIX-backend" http://localhost:3000/

WEB="$PREFIX-web"
# Trusts the test's own curl, which connects from 127.0.0.1 like a host proxy
start_web "$WEB" -e VW_TRUSTED_PROXIES=127.0.0.0/8

check "GET /v1/models reaches the backend with the /v1 prefix" \
  "200 backend GET /v1/models" "$(request "$WEB" http://localhost/v1/models)"
check "POST /v1/chat/completions reaches the backend" \
  "200 backend POST /v1/chat/completions" \
  "$(request "$WEB" -X POST -H 'Content-Type: application/json' -d '{}' http://localhost/v1/chat/completions)"
check "a /v1 path ending in .js is proxied, not served as a static file" \
  "200 backend GET /v1/files/app.js" "$(request "$WEB" http://localhost/v1/files/app.js)"
check "GET /api keeps its prefix and query string" \
  "200 backend GET /api/users?page=2" "$(request "$WEB" 'http://localhost/api/users?page=2')"
check "an /api path ending in .png is proxied, not served as a static file" \
  "200 backend GET /api/files/logo.png" "$(request "$WEB" http://localhost/api/files/logo.png)"

# The backend trusts one hop and reads the last X-Forwarded-For entry as the
# client. Behind a host proxy that must still be the client, not the proxy.
check "the client from a trusted proxy's X-Forwarded-For stays the last entry" \
  "200 xff 198.51.100.9, 203.0.113.7, 203.0.113.7" \
  "$(request "$WEB" -H 'X-Forwarded-For: 198.51.100.9, 203.0.113.7' http://localhost/api/client-ip)"
check "the scheme a TLS host proxy reports is kept" \
  "200 proto https" "$(request "$WEB" -H 'X-Forwarded-Proto: https' http://localhost/api/proto)"
check "without a reported scheme the request's own is sent" \
  "200 proto http" "$(request "$WEB" http://localhost/api/proto)"

ROOT=$(request "$WEB" http://localhost/)
check "/ is served by the frontend itself" "200 false" \
  "${ROOT%% *} $([[ "$ROOT" == *"backend GET"* ]] && echo true || echo false)"

RENDERED=$(docker exec "$WEB" cat /etc/nginx/conf.d/default.conf)
check "the rendered config has no unfilled template variables" "false" \
  "$([[ "$RENDERED" == *'${'* ]] && echo true || echo false)"
check "nginx's own variables survive rendering" "true" \
  "$([[ "$RENDERED" == *'proxy_set_header Host $host;'* ]] && echo true || echo false)"

start_web "$PREFIX-web-untrusted"
check "by default (no VW_TRUSTED_PROXIES), X-Forwarded-For is not believed" \
  "200 xff 203.0.113.7, 127.0.0.1" \
  "$(request "$PREFIX-web-untrusted" -H 'X-Forwarded-For: 203.0.113.7' http://localhost/api/client-ip)"

start_web "$PREFIX-web-slash" -e VW_BACKEND_URL=http://backend:3000/
check "a trailing slash in VW_BACKEND_URL is dropped" \
  "200 backend GET /v1/models" "$(request "$PREFIX-web-slash" http://localhost/v1/models)"

for bad in http://backend:3000/api http://backend: backend:3000 'http://backend:3000?x=1'; do
  name="$PREFIX-web-bad-$(echo "$bad" | tr -c 'a-z0-9' '-')"
  docker run -d --name "$name" --network "$NET" -e VW_BACKEND_URL="$bad" "$IMAGE" >/dev/null
  for _ in $(seq 1 15); do
    [ "$(docker inspect -f '{{.State.Running}}' "$name")" = "false" ] && break
    sleep 1
  done
  check "VW_BACKEND_URL=$bad stops the container at startup" "false 1" \
    "$(docker inspect -f '{{.State.Running}} {{.State.ExitCode}}' "$name")"
done

UNAVAILABLE='503 {"detail":"VerifyWise is unavailable, please retry shortly"}'
API_UNAVAILABLE='503 {"message":"VerifyWise is unavailable, please retry shortly"}'
docker stop "$PREFIX-backend" >/dev/null
check "a stopped backend gives the JSON 503" \
  "$UNAVAILABLE" "$(request "$WEB" http://localhost/v1/models)"
check "a stopped backend gives /api the app's JSON 503" \
  "$API_UNAVAILABLE" "$(request "$WEB" http://localhost/api/users)"

# A non-routable address usually drops the connection silently, as a stopped
# container's cached address does on Linux, so the connect times out. Where
# the network refuses it instead, this takes the 502 path and still passes;
# the stopped-backend check above covers the timeout on Linux CI.
start_web "$PREFIX-web-blackhole" -e VW_BACKEND_URL=http://10.255.255.1:3000
check "a backend that never accepts the connection gives the JSON 503" \
  "$UNAVAILABLE" "$(request "$PREFIX-web-blackhole" http://localhost/v1/models)"
check "/api to a backend that never accepts the connection gives the JSON 503" \
  "$API_UNAVAILABLE" "$(request "$PREFIX-web-blackhole" http://localhost/api/users)"

start_web "$PREFIX-web-unresolved" -e VW_BACKEND_URL=http://no-such-backend:3000
check "nginx starts when the backend name does not resolve" "200" \
  "$(request "$PREFIX-web-unresolved" http://localhost/ | head -c 3)"
check "an unresolvable backend gives the JSON 503" \
  "$UNAVAILABLE" "$(request "$PREFIX-web-unresolved" http://localhost/v1/models)"

# The Ansible host nginx template, rendered with sample values. It proxies to
# localhost, so stub frontend (8080) and backend (3000) servers run in its
# network namespace.
HOST_CONF=$(sed -e 's/{{ server_name_value }}/localhost/' \
  -e 's/{{ frontend_port }}/8080/' -e 's/{{ backend_port }}/3000/' \
  ansible/templates/verifywise-nginx.conf.j2)
check "the host template has no unfilled Jinja variables" "false" \
  "$([[ "$HOST_CONF" == *'{{'* ]] && echo true || echo false)"
HOST="$PREFIX-host"
docker run -d --name "$HOST" -e HOST_CONF="$HOST_CONF" "$BASE_IMAGE" sh -c \
  'printf "%s" "$HOST_CONF" > /etc/nginx/conf.d/default.conf && mkdir -p /var/www/verifywise && echo maintenance > /var/www/verifywise/upgrade.html && exec nginx -g "daemon off;"' >/dev/null
# /upgrade.html is an internal location, so nginx answers it itself (404) and no
# upstream is touched. A failed connect here would mark that upstream dead for
# fail_timeout (10s), and every check inside that window would get the
# maintenance page instead of the proxied response.
wait_for_nginx "$HOST" http://localhost/upgrade.html
# Both loopback families: inside a container "localhost" also resolves to ::1,
# and the template proxies to localhost, so an IPv4-only stub makes nginx try
# [::1] first and fail. A real host resolves localhost to 127.0.0.1 only.
HOST_STUBS='server { listen 3000; listen [::]:3000; default_type text/plain;
  location / { return 200 "backend $request_uri conn=$http_connection xff=$http_x_forwarded_for"; } }
server { listen 8080; listen [::]:8080; default_type text/plain; location / { return 200 "frontend $request_uri"; } }'
docker run -d --name "$PREFIX-host-stubs" --network "container:$HOST" \
  -e STUB_CONF="$HOST_STUBS" "$BASE_IMAGE" \
  sh -c 'printf "%s" "$STUB_CONF" > /etc/nginx/conf.d/default.conf && exec nginx -g "daemon off;"' >/dev/null
wait_for_nginx "$PREFIX-host-stubs" http://localhost:3000/
wait_for_nginx "$PREFIX-host-stubs" http://localhost:8080/

check "host: /api reaches the backend with forwarded headers and Connection close" \
  "200 backend /api/users conn=close xff=127.0.0.1" "$(request "$HOST" http://localhost/api/users)"
check "host: Connection upgrade only when the client asks for it" \
  "200 backend /api/ws conn=upgrade xff=127.0.0.1" \
  "$(request "$HOST" -H 'Upgrade: websocket' http://localhost/api/ws)"
check "host: /v1 reaches the backend" \
  "200 backend /v1/models conn= xff=127.0.0.1" "$(request "$HOST" http://localhost/v1/models)"
check "host: a path that only starts with api goes to the frontend" \
  "200 frontend /apidocs" "$(request "$HOST" http://localhost/apidocs)"
docker stop "$PREFIX-host-stubs" >/dev/null
check "host: /api with the backend down gives the app's JSON 503" \
  "$API_UNAVAILABLE" "$(request "$HOST" http://localhost/api/users)"
check "host: /v1 with the backend down gives the JSON 503" \
  "$UNAVAILABLE" "$(request "$HOST" http://localhost/v1/models)"
check "host: pages keep the maintenance page" \
  "502 maintenance" "$(request "$HOST" http://localhost/)"

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES check(s) failed"
  exit 1
fi
echo "All checks passed"
