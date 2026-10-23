# Multi-replica scaling scenario

How to run VerifyWise with more than one backend replica behind a load
balancer, and what to expect (#4677). The harness is
`docker-compose.multireplica.yml` at the repo root (docker-compose.yml is
untouched) plus the k6 scenario `Servers/tests/perf/multireplica.k6.js`.

## Architecture

```
                 ┌─────────────┐
   client ─────▶ │  nginx (lb) │  :8080, least_conn upstream,
                 │  X-Backend  │  X-Backend response header
                 └──┬───────┬──┘
              :3000 │       │ :3000
              ┌─────┴──┐ ┌──┴─────┐
              │backend-│ │backend-│   same image, same env,
              │   1    │ │   2    │   no sticky sessions
              └──┬───┬─┘ └──┬───┬─┘
                 │   │      │   │
            ┌────┴┐ └──────┴┐ └──────┐
            │ PG  │   Redis │  (AI gateway NOT required for this test)
            └─────┘         │
```

- Both replicas are the **same image with the same env** — Postgres, Redis,
  and JWT auth are shared/stateless; anything that only worked with one
  process (in-process caches, per-process limiter counters) shows up here.
- nginx is configured inline in the compose file and adds an
  `X-Backend: <upstream addr>` response header, because the application has
  no hostname-revealing endpoint of its own and one must not be added just
  for testing.

## Running it

Prereqs: Docker with the compose plugin, k6, and a `.env` file with the
same variables docker-compose.yml requires
(`DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `JWT_SECRET`,
`ENCRYPTION_KEY`, `AI_GATEWAY_INTERNAL_KEY`, `SUPERADMIN_EMAIL`,
`SUPERADMIN_PASSWORD`).

```bash
# 1. Bring the stack up (postgres + redis + 2 backends + lb on :8080)
docker compose -f docker-compose.multireplica.yml --env-file .env up -d

# 2. Wait for health
curl -sf http://localhost:8080/health/ready

# 3. Run the scenario test
k6 run -e BASE_URL=http://localhost:8080 \
       -e PERF_EMAIL="$SUPERADMIN_EMAIL" \
       -e PERF_PASSWORD="$SUPERADMIN_PASSWORD" \
       Servers/tests/perf/multireplica.k6.js

# 4. Tear down
docker compose -f docker-compose.multireplica.yml --env-file .env down
```

## Expected results

1. **Request distribution** — the k6 script samples the `X-Backend` header
   over 40 requests and requires **≥ 2 distinct upstreams**. With
   `least_conn` and one client this reduces to round-robin, so you should
   see the two upstream addresses roughly alternating.

2. **Cross-replica rate limiting** — `Servers/middleware/rateLimit.middleware.ts`
   uses express-rate-limit's default in-process `MemoryStore` (no store is
   configured). Limits are therefore **per replica**:

   | Store | 500 rapid requests, 2 replicas, 300/min generalApi limit |
   |-------|----------------------------------------------------------|
   | In-memory (current) | **0 × 429 expected** — each replica counts ~250 requests, under its own 300/min budget. Effective client budget ≈ N_replicas × 300. |
   | Redis-backed (hypothetical) | **429s expected** — the 300/min budget is shared, so the client trips the limit partway through. |

   The script asserts the in-memory expectation (no 429s). **If those
   assertions ever fail because a Redis store was wired into the limiters,
   that is the test catching an intended change** — update both the script
   comments and this table.

3. **No local state assumptions** — the script never sets cookies/affinity
   and reuses one JWT across replicas (JWT auth is stateless, verified by
   the login-through-LB step).

## Known limitation and follow-up

Per-replica in-memory rate limiting means **horizontal scaling multiplies
the effective abuse budget**: N replicas ⇒ N × per-replica limit for a
given client IP. For brute-force controls (loginLimiter is 5/min) that is
material. The follow-up is to back the limiters with a shared
`express-rate-limit` Redis store (Redis is already part of the stack) and
then flip the k6 expectations to the "Redis-backed" row above. Tracked
under #4677.

## Not covered by this scenario

- Horizontal scaling of the **worker** (`node dist/jobs/worker.js`): BullMQ
  already coordinates through Redis, so multiple workers are safe by
  design, but this harness only scales the HTTP backend.
- WebSocket/SSE-style stateful connections (the app currently has none).
- The AI Gateway / Eval Server — the scenario runs the backend with a
  placeholder `AI_GATEWAY_URL`; gateway calls are not exercised.
