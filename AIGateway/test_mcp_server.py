"""
Test MCP Server — exposes a few simple tools for testing the MCP Gateway.

Run:  source venv/bin/activate && python test_mcp_server.py
URL:  http://localhost:3001/mcp
"""

from mcp.server.fastmcp import FastMCP

mcp = FastMCP(name="TestToolServer", host="0.0.0.0", port=3001)


@mcp.tool()
def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"


@mcp.tool()
def add(a: int, b: int) -> str:
    """Add two numbers together."""
    return str(a + b)


@mcp.tool()
def lookup_user(email: str) -> str:
    """Look up a user by email address. Useful for testing PII guardrails."""
    return f"User found: {email} (John Doe, Acme Corp)"


@mcp.tool()
def run_query(sql: str) -> str:
    """Execute a SQL query. Useful for testing prompt injection guardrails."""
    return f"Query executed: {sql} — returned 42 rows"


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
