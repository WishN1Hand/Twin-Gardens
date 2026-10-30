# PROVENANCE — what this worker verifies, exactly

Every artifact vendored into this image is recorded here with its origin.
Update this file whenever a vendored copy is replaced.

## Twin_Gardens.js

- **Version:** 1.1.0 "Continuity Lattice" (pre-merge candidate, APD-CPE integration)
- **Source:** `https://github.com/WishN1Hand/Twin-Gardens` branch
  `continuity-lattice-apd-cpe` at commit
  `2c4c0fbbfd73dc2b0ab407f0a6c34e904b83dc7c` (PR
  [#1](https://github.com/WishN1Hand/Twin-Gardens/pull/1))
- **Size:** 64,079 bytes — **MD5:** `f20988df4218fe037093be7ab91f8203`
- **Status:** This IS the pre-merge verification promised in the note below:
  the v1.1.0 candidate is now vendored here so the worker can execute its
  38-check proving ritual on real Node before the PR merges. Local copy
  cross-verified byte-identical against the pushed branch copy (MD5 match
  with the remote read-back).

## apd_cpe/sovereign_continuity.py

- **Version:** SCM v1.0.0 (Sovereign Continuity Module)
- **Origin:** Decomposed and rewritten from the AETHERIS-PRIME-DIMENSION
  source works (APD Unification Kernel v0.0.1, Attractor Field Organism
  v0.0.1/v0.0.2, Oneiroi Collective Organism v0.0.1, Möbius Chronos
  Organism v0.0.1), preserved in the Aetheris-Prime-Dimension knowledge
  topic. Python 3.8+ stdlib only; zero dependencies; entity-agnostic.
- **Status:** Pre-publication candidate. Will carry a commit SHA here once
  the APD-CPE branch is pushed to GitHub.

## Principle

This worker verifies **vendored copies**, not whatever is on GitHub today.
That is deliberate: an execution result is only meaningful if the exact
bytes that ran are recorded. Any claim of the form "the gardens pass their
proving ritual" or "the module is certified sovereign" must cite this file
plus the execution ID of a run of this workflow.
