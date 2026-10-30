#!/usr/bin/env python3
"""Worker entrypoint for the AP verification deployment.

Discovers workflow classes in the `workflows` package and registers them
with the Mistral Workflows platform. Runs as the container's CMD; the
service-account token is injected by the platform (no API key here).
"""

import asyncio
import sys
from pathlib import Path

# Make the project root importable regardless of working directory.
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import mistralai_workflows  # noqa: E402  (needs ROOT on sys.path first)
from mistralai_workflows import discover_workflows  # noqa: E402


async def main() -> None:
    discovered = discover_workflows()
    names = [getattr(wf, "__name__", str(wf)) for wf in discovered]
    print(f"AP verify worker: discovered {len(discovered)} workflow(s): {', '.join(names)}")
    await mistralai_workflows.run_worker(discovered)


if __name__ == "__main__":
    asyncio.run(main())
