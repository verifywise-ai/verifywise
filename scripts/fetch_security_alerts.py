#!/usr/bin/env python3
"""Fetch Dependabot and Code Scanning alerts from GitHub API and save to JSON."""

import json
import os
import re
import sys
import urllib.parse
import urllib.request

REPO = "verifywise-ai/verifywise"
TOKEN = os.environ.get("GITHUB_TOKEN")
if not TOKEN:
    sys.exit("GITHUB_TOKEN environment variable is required")

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def parse_link_header(link_header: str | None):
    """Parse GitHub Link header into a dict rel -> url."""
    links = {}
    if not link_header:
        return links
    for part in link_header.split(","):
        match = re.match(r'\s*<([^>]+)>\s*;\s*rel="([^"]+)"', part)
        if match:
            links[match.group(2)] = match.group(1)
    return links


def _validate_github_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != "api.github.com":
        sys.exit(f"Refusing to fetch unexpected URL: {url}")
    return url


def fetch_all(endpoint: str, use_page: bool = True):
    results = []
    per_page = 100
    if use_page:
        page = 1
        url = f"https://api.github.com/repos/{REPO}/{endpoint}?per_page={per_page}&page={page}"
    else:
        url = f"https://api.github.com/repos/{REPO}/{endpoint}?per_page={per_page}"

    while url:
        url = _validate_github_url(url)
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode())
                link_header = resp.headers.get("Link")
        except urllib.error.HTTPError as exc:
            print(f"ERROR fetching {url}: {exc.code} {exc.reason}", file=sys.stderr)
            try:
                print(exc.read().decode(), file=sys.stderr)
            except Exception:
                pass
            raise
        if not isinstance(data, list):
            sys.exit(f"Unexpected response shape for {endpoint}: {type(data)}")
        if not data:
            break
        results.extend(data)
        print(f"{endpoint}: fetched {len(data)} records (total {len(results)})")

        links = parse_link_header(link_header)
        url = links.get("next")
    return results


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "security-alerts")
    os.makedirs(out_dir, exist_ok=True)

    dependabot = fetch_all("dependabot/alerts", use_page=False)
    code_scanning = fetch_all("code-scanning/alerts", use_page=True)

    with open(os.path.join(out_dir, "dependabot_alerts.json"), "w", encoding="utf-8") as f:
        json.dump(dependabot, f, indent=2)

    with open(os.path.join(out_dir, "code_scanning_alerts.json"), "w", encoding="utf-8") as f:
        json.dump(code_scanning, f, indent=2)

    print(f"Saved {len(dependabot)} Dependabot alerts and {len(code_scanning)} Code Scanning alerts to {out_dir}")


if __name__ == "__main__":
    main()
