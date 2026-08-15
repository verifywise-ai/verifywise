import json
from collections import Counter

with open("code_scanning_alerts_summary.json", "r", encoding="utf-8") as f:
    summary = json.load(f)

open_alerts = [a for a in summary if a["state"] == "open"]

print("=== Open alerts by tool ===")
for tool, count in Counter(a["tool"] for a in open_alerts).most_common():
    print(f"  {tool}: {count}")

print("\n=== Open alerts by severity ===")
for sev, count in Counter(a["severity"] for a in open_alerts).most_common():
    print(f"  {sev}: {count}")

print("\n=== Open alerts by rule ID (top 30) ===")
for rule, count in Counter(a["rule_id"] for a in open_alerts).most_common(30):
    print(f"  {rule}: {count}")

print("\n=== Open alerts by file path (top 30) ===")
for path, count in Counter(a["path"] for a in open_alerts if a["path"]).most_common(30):
    print(f"  {path}: {count}")
