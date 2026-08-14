#!/usr/bin/env python3
"""Fetch all GitHub code-scanning alerts for verifywise-ai/verifywise."""
import json
import os
import sys
import time

import requests

OWNER = "verifywise-ai"
REPO = "verifywise"
BASE_URL = f"https://api.github.com/repos/{OWNER}/{REPO}/code-scanning/alerts"
TOKEN = os.environ.get("GITHUB_TOKEN")

if not TOKEN:
    print("GITHUB_TOKEN environment variable is not set.", file=sys.stderr)
    sys.exit(1)

headers = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def fetch_alerts(state=None):
    all_alerts = []
    page = 1
    per_page = 100
    while True:
        params = {"page": page, "per_page": per_page}
        if state:
            params["state"] = state
        print(f"Fetching API state={state} page {page} ...", file=sys.stderr)
        resp = requests.get(BASE_URL, headers=headers, params=params, timeout=60)
        if resp.status_code != 200:
            print(f"Failed on page {page}: {resp.status_code} {resp.text}", file=sys.stderr)
            sys.exit(1)
        data = resp.json()
        if not data:
            break
        all_alerts.extend(data)
        print(f"  -> got {len(data)} alerts (total so far: {len(all_alerts)})", file=sys.stderr)
        if len(data) < per_page:
            break
        page += 1
        time.sleep(0.3)
    return all_alerts


# Fetch open, dismissed, and fixed alerts separately.
open_alerts = fetch_alerts("open")
dismissed_alerts = fetch_alerts("dismissed")
fixed_alerts = fetch_alerts("fixed")

all_alerts = open_alerts + dismissed_alerts + fixed_alerts
print(f"\nTotal alerts fetched: {len(all_alerts)} (open={len(open_alerts)}, dismissed={len(dismissed_alerts)}, fixed={len(fixed_alerts)})", file=sys.stderr)

# Save full API response
with open("code_scanning_alerts.json", "w", encoding="utf-8") as f:
    json.dump(all_alerts, f, indent=2, ensure_ascii=False)

# Build a compact summary
summary = []
for alert in all_alerts:
    rule = alert.get("rule", {})
    tool = alert.get("tool", {})
    loc = alert.get("most_recent_instance", {}).get("location", {})
    summary.append({
        "number": alert.get("number"),
        "state": alert.get("state"),
        "severity": rule.get("severity") or rule.get("security_severity_level"),
        "rule_id": rule.get("id"),
        "rule_description": rule.get("description"),
        "rule_name": rule.get("name"),
        "rule_tags": rule.get("tags", []),
        "tool": tool.get("name"),
        "path": loc.get("path"),
        "start_line": loc.get("start_line"),
        "end_line": loc.get("end_line"),
        "html_url": alert.get("html_url"),
        "created_at": alert.get("created_at"),
        "dismissed_at": alert.get("dismissed_at"),
        "dismissed_reason": alert.get("dismissed_reason"),
        "dismissed_comment": alert.get("dismissed_comment"),
    })

with open("code_scanning_alerts_summary.json", "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)

# Simulate GitHub web UI pagination (25 alerts per page) for the open alerts,
# matching the URLs the user listed.
WEB_PER_PAGE = 25


def paginate_web(items, per_page):
    pages = {}
    for idx, item in enumerate(items, start=1):
        page_num = (idx - 1) // per_page + 1
        pages.setdefault(page_num, []).append(item)
    return pages


web_pages = paginate_web(open_alerts, WEB_PER_PAGE)

with open("code_scanning_web_pages.json", "w", encoding="utf-8") as f:
    serializable = {}
    for page_num, alerts in web_pages.items():
        serializable[page_num] = [a.get("number") for a in alerts]
    json.dump(
        {
            "per_page": WEB_PER_PAGE,
            "total_open": len(open_alerts),
            "total_pages": len(web_pages),
            "pages": serializable,
        },
        f,
        indent=2,
        ensure_ascii=False,
    )

# Human-readable markdown report
with open("code_scanning_alerts_report.md", "w", encoding="utf-8") as f:
    f.write(f"# Code Scanning Alerts for {OWNER}/{REPO}\n\n")
    f.write(f"- **Total alerts:** {len(all_alerts)}\n")
    f.write(f"- **Open:** {len(open_alerts)}\n")
    f.write(f"- **Dismissed:** {len(dismissed_alerts)}\n")
    f.write(f"- **Fixed:** {len(fixed_alerts)}\n\n")

    f.write("## Web UI page mapping (open alerts, 25 per page)\n\n")
    for page_num, alert_numbers in serializable.items():
        url = f"https://github.com/{OWNER}/{REPO}/security/code-scanning"
        if page_num > 1:
            url += f"?page={page_num}"
        f.write(f"- **Page {page_num}** ({len(alert_numbers)} alerts): {url}\n")
        f.write(f"  - Alert numbers: {', '.join(str(n) for n in alert_numbers)}\n")
    f.write("\n")

    f.write("## Open alerts by page\n\n")
    for page_num, alerts in web_pages.items():
        f.write(f"### Page {page_num}\n\n")
        for alert in alerts:
            rule = alert.get("rule", {})
            tool = alert.get("tool", {})
            loc = alert.get("most_recent_instance", {}).get("location", {})
            f.write(f"#### Alert #{alert.get('number')}\n")
            f.write(f"- **State:** {alert.get('state')}\n")
            f.write(f"- **Severity:** {rule.get('severity') or rule.get('security_severity_level')}\n")
            f.write(f"- **Tool:** {tool.get('name')}\n")
            f.write(f"- **Rule ID:** {rule.get('id')}\n")
            f.write(f"- **Rule Name:** {rule.get('name')}\n")
            f.write(f"- **Description:** {rule.get('description')}\n")
            f.write(f"- **Location:** `{loc.get('path')}:{loc.get('start_line')}-{loc.get('end_line')}`\n")
            f.write(f"- **URL:** {alert.get('html_url')}\n")
            f.write(f"- **Created:** {alert.get('created_at')}\n")
            f.write("\n")

    if dismissed_alerts:
        f.write("## Dismissed alerts\n\n")
        for alert in dismissed_alerts:
            rule = alert.get("rule", {})
            loc = alert.get("most_recent_instance", {}).get("location", {})
            f.write(f"- **#{alert.get('number')}** `{rule.get('id')}` @ `{loc.get('path')}:{loc.get('start_line')}` — {alert.get('dismissed_reason')} — {alert.get('html_url')}\n")
        f.write("\n")

    if fixed_alerts:
        f.write("## Fixed alerts\n\n")
        for alert in fixed_alerts:
            rule = alert.get("rule", {})
            loc = alert.get("most_recent_instance", {}).get("location", {})
            f.write(f"- **#{alert.get('number')}** `{rule.get('id')}` @ `{loc.get('path')}:{loc.get('start_line')}` — {alert.get('html_url')}\n")
        f.write("\n")

print("Saved:", file=sys.stderr)
print("  - code_scanning_alerts.json (full API response)", file=sys.stderr)
print("  - code_scanning_alerts_summary.json (compact summary)", file=sys.stderr)
print("  - code_scanning_web_pages.json (web UI page mapping)", file=sys.stderr)
print("  - code_scanning_alerts_report.md (human-readable report)", file=sys.stderr)
