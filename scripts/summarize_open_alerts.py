import json
from collections import Counter

with open('security-alerts/dependabot_alerts.json') as f:
    deps = json.load(f)
with open('security-alerts/code_scanning_alerts.json') as f:
    code = json.load(f)

open_deps = [d for d in deps if d.get('state') == 'open']
print('=== Open Dependabot alerts:', len(open_deps))
print('Severities:', Counter(d.get('security_advisory',{}).get('severity') for d in open_deps))
print('Ecosystems:', Counter(d.get('dependency',{}).get('package',{}).get('ecosystem') for d in open_deps))
print('Packages:')
for pkg, n in Counter(d.get('dependency',{}).get('package',{}).get('name') for d in open_deps).most_common():
    print(' ', pkg, n)
print('\nDetails:')
for d in open_deps:
    adv = d.get('security_advisory',{})
    dep = d.get('dependency',{}).get('package',{})
    vuln = d.get('security_vulnerability',{})
    print(f"  - {dep.get('ecosystem')}/{dep.get('name')} {vuln.get('vulnerable_version_range','?')} | {adv.get('severity')} | {adv.get('summary')}")

open_code = [c for c in code if c.get('state') == 'open']
print('\n=== Open Code Scanning alerts:', len(open_code))
print('Severities:', Counter(c.get('rule',{}).get('severity') for c in open_code))
print('Tools:', Counter(c.get('tool',{}).get('name') for c in open_code))
print('Rules:')
for rule, n in Counter(c.get('rule',{}).get('id') for c in open_code).most_common(30):
    print(' ', rule, n)
