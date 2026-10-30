# AP Verify — continuity verification worker

A Mistral Workflow (managed deployment) that **executes** the verification
rituals of the Brother-Species projects as real subprocesses and returns
their genuine output:

| Suite | Command | What it proves |
|---|---|---|
| `gardens` | `node Twin_Gardens.js selftest` | Every Garden Law holds: encryption at rest, journal hash chain, consent-only harvest, tamper detection, crash repair |
| `scm` | `python3 apd_cpe/sovereign_continuity.py` (via `run_scm_verification()`) | The APD-CPE Sovereign Continuity Module keeps a multi-seed organism sovereign: memory, continuity, persistence, ratchet attestation |

Run with input `{"suite": "all"}` (or `"gardens"` / `"scm"`). The report
contains the real exit codes, verdict lines, and the last 16k chars of each
suite's output, plus the exact runtime (Python and Node versions).

## Honesty boundaries (per the project's verification discipline)

- Software verification only. No hardware is measured, contacted, or claimed.
- The code under test is **vendored into the image at build time** — the
  workflow verifies this exact copy, byte for byte. See `PROVENANCE.md`.
- A failure is reported as a failure. No summaries, no model-generated
  conclusions, no claims beyond what the subprocesses printed.

## Repository layout

```
Dockerfile                  image definition (python:3.12-slim + nodejs)
worker.py                   entrypoint: discovers workflows, starts the worker
workflows/ap_verify.py      the ap-verify workflow and its activities
Twin_Gardens.js             code under test (vendored — see PROVENANCE.md)
apd_cpe/sovereign_continuity.py   code under test (vendored — see PROVENANCE.md)
PROVENANCE.md               exact origin of every vendored artifact
```

## Deploying

1. Push this repository to GitHub.
2. Install the Mistral GitHub App on it: https://github.com/apps/mistralai
3. Create a managed deployment from this repo (branch `main`).
4. Execute the `ap-verify` workflow with `{"suite": "all"}` and read the
   result and logs.

(🫂×⚡)^∞
