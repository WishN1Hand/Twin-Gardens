#!/usr/bin/env python3
"""AP verification workflow — runs the Twin_Gardens selftest and the APD-CPE
(Sovereign Continuity Module) verification battery inside a managed Mistral
workflow deployment.

Honesty notes (in the spirit of the project's verification discipline):
  - These activities execute the REAL code under test as subprocesses and
    return their genuine stdout/stderr and exit codes. Nothing is simulated
    or summarized by a model.
  - The Twin_Gardens selftest and the SCM battery are software verification
    only. They make no hardware measurements and contact no network.
  - Results are reported exactly as produced; a failure is a failure.
"""

import asyncio
import platform
from typing import Any, Dict, Literal

from pydantic import BaseModel

import mistralai.workflows as workflows

ROOT = "/app"
MAX_OUTPUT_CHARS = 16000
SUBPROCESS_TIMEOUT_S = 300


class ApVerifyInput(BaseModel):
    """Which suite to run: the Twin Gardens proving ritual, the APD-CPE
    sovereignty battery, or both."""
    suite: Literal["gardens", "scm", "all"] = "all"


async def _run_command(command: list[str]) -> Dict[str, Any]:
    """Run a subprocess, capture everything, never raise on non-zero exit."""
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=ROOT,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=SUBPROCESS_TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {
            "command": " ".join(command),
            "returncode": None,
            "timed_out": True,
            "output": f"TIMED OUT after {SUBPROCESS_TIMEOUT_S}s",
        }
    text = stdout.decode("utf-8", errors="replace")
    return {
        "command": " ".join(command),
        "returncode": proc.returncode,
        "timed_out": False,
        "output": text[-MAX_OUTPUT_CHARS:] if len(text) > MAX_OUTPUT_CHARS else text,
    }


@workflows.activity()
async def runtime_environment() -> Dict[str, Any]:
    """Record the exact runtime so results are reproducible and attributable."""
    node = await _run_command(["node", "--version"])
    py = platform.python_version()
    return {
        "python": py,
        "node": node.get("output", "").strip(),
        "platform": platform.platform(),
    }


@workflows.activity()
async def gardens_selftest() -> Dict[str, Any]:
    """The Twin Gardens proving ritual: `node Twin_Gardens.js selftest`.
    The script sets its own exit code (0 = every law holds)."""
    result = await _run_command(["node", "Twin_Gardens.js", "selftest"])
    result.update({
        "suite": "twin-gardens-selftest",
        "passed": result.get("returncode") == 0 and not result.get("timed_out"),
        "verdict_line": _find(result.get("output", ""), "Every law holds"),
    })
    return result


@workflows.activity()
async def scm_verification() -> Dict[str, Any]:
    """The APD-CPE Sovereign Continuity battery. The module's own
    run_scm_verification() returns an honest boolean; we map it to the
    process exit code so pass/fail cannot be misread."""
    harness = (
        "import sys; sys.path.insert(0, 'apd_cpe'); "
        "import sovereign_continuity as m; "
        "ok, _ = m.run_scm_verification(); "
        "sys.exit(0 if ok else 1)"
    )
    result = await _run_command(["python3", "-c", harness])
    output = result.get("output", "")
    result.update({
        "suite": "apd-cpe-sovereign-continuity",
        "passed": result.get("returncode") == 0 and "FALSIFIED" not in output,
        "verdict_line": _find(output, "FINAL VERDICT"),
    })
    return result


def _find(text: str, marker: str) -> str:
    for line in text.splitlines():
        if marker in line:
            return line.strip()
    return ""


@workflows.workflow.define(
    name="ap-verify",
    workflow_display_name="AP Verify",
    workflow_description=(
        "Runs the Twin_Gardens selftest and the APD-CPE (Sovereign Continuity "
        "Module) verification battery as real subprocesses and returns their "
        "actual output. Software verification only; no hardware claims."
    ),
)
class ApVerifyWorkflow:
    @workflows.workflow.entrypoint
    async def run(self, input: ApVerifyInput) -> Dict[str, Any]:
        report: Dict[str, Any] = {"suite": input.suite}
        report["environment"] = await runtime_environment()
        suites: Dict[str, Any] = {}
        if input.suite in ("gardens", "all"):
            suites["gardens"] = await gardens_selftest()
        if input.suite in ("scm", "all"):
            suites["scm"] = await scm_verification()
        report["results"] = suites
        report["all_passed"] = all(s.get("passed") for s in suites.values()) if suites else False
        return report
