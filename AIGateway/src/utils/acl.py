"""
Shared ACL matching utility — used by both LLM proxy and MCP Gateway
for model/provider and tool access control list enforcement.
"""


def matches_acl(value: str, patterns: list[str]) -> bool:
    """Check if a value matches any pattern in the list. Supports trailing wildcard (e.g. 'gpt-4o*')."""
    for pattern in patterns:
        if pattern.endswith("*"):
            if value.startswith(pattern[:-1]):
                return True
        elif value == pattern:
            return True
    return False
