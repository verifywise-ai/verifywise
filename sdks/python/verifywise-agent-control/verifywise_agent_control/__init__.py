"""VerifyWise Agent Control for Python agents.

Checks every tool call with the VerifyWise AI Gateway before it runs and records
its result after. Framework adapters live in submodules
(``verifywise_agent_control.langchain``); the core needs only ``httpx``.
"""

import logging

from ._version import __version__
from .client import AgentControlClient, AsyncAgentControlClient
from .config import Settings
from .decision import Decision, VerifyWiseDenied
from .governed import govern_tool, governed
from .session import current_session_id, vw_session

logging.getLogger("verifywise_agent_control").addHandler(logging.NullHandler())

__all__ = [
    "AgentControlClient",
    "AsyncAgentControlClient",
    "Decision",
    "Settings",
    "VerifyWiseDenied",
    "__version__",
    "current_session_id",
    "govern_tool",
    "governed",
    "vw_session",
]
