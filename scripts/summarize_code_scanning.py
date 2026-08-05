import json
from collections import Counter, defaultdict

with open('security-alerts/code_scanning_alerts.json') as f:
    alerts = json.load(f)

open_alerts = [a for a in alerts if a.get('state') == 'open']
print('Open code scanning alerts:', len(open_alerts))
print('By tool:', Counter(a.get('tool',{}).get('name') for a in open_alerts))
print('By severity:', Counter(a.get('rule',{}).get('severity') for a in open_alerts))
print('\nBy rule:')
by_rule = defaultdict(list)
for a in open_alerts:
    by_rule[a.get('rule',{}).get('id')].append(a)

for rule, items in sorted(by_rule.items(), key=lambda x: -len(x[1])):
    print(f"\n{rule} ({len(items)})")
    sev = items[0].get('rule',{}).get('severity')
    tool = items[0].get('tool',{}).get('name')
    desc = items[0].get('rule',{}).get('description','')
    print(f"  severity={sev} tool={tool}")
    print(f"  desc={desc[:120]}")
    files = Counter(a.get('most_recent_instance',{}).get('location',{}).get('path') for a in items)
    for path, n in files.most_common(8):
        print(f"    {path}: {n}")
