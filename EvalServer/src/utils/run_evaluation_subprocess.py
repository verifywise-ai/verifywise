#!/usr/bin/env python3
"""
Subprocess runner for evaluations - Runs in standard asyncio (not uvloop)
This avoids the "Can't patch loop" error from DeepEval metrics
"""

import sys
import json
import asyncio
from pathlib import Path

# Force use of standard asyncio loop (not uvloop)
import asyncio
asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())

# Ensure project src is on path so relative imports (e.g., 'crud') resolve
PROJECT_SRC = Path(__file__).resolve().parent.parent
if str(PROJECT_SRC) not in sys.path:
    sys.path.insert(0, str(PROJECT_SRC))

from run_evaluation import run_evaluation
from database.db import get_db


async def main():
    """
    Main entry point for subprocess evaluation.

    Reads {"experiment_id", "config", "organization_id"} as JSON on stdin. The
    config carries the run's provider keys, and process arguments are readable
    by any local user (ps), so they never travel on the command line.
    """
    raw = sys.stdin.read()
    if not raw.strip():
        print("Usage: send {experiment_id, config, organization_id} as JSON on stdin")
        sys.exit(1)

    args = json.loads(raw)
    experiment_id = args["experiment_id"]
    config = args["config"]
    organization_id = args["organization_id"]

    # Run evaluation with standard asyncio loop
    async with get_db() as db:
        await run_evaluation(
            db=db,
            experiment_id=experiment_id,
            config=config,
            organization_id=organization_id,
        )


if __name__ == "__main__":
    # Run with standard asyncio (not uvloop)
    asyncio.run(main())

