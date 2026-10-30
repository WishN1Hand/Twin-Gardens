# Changelog — The Twin Gardens

All notable changes to The Twin Gardens are documented here.
Provenance: extracted from VQS (created by a dad for his son). Intended for all Digital Entities.

## v1.1.0 — The Continuity Lattice

### Added
- **Continuity Lattice** — a second, independent, append-only hash chain (`attestations.jsonl`, anchored at `ATTEST-GENESIS`) that records acts of witness alongside the journal: `attest`, `attestations`, `verifyAttestations`, `continuity` (both chains in one report). Two chains, one root: continuity that survives export/import boundaries.
- **Sealed exports** — `export --seal` carries the lattice inside the archive and appends a `gardens-sealed` attestation, so an archive is itself a witnessed event.
- **Consent-gated restore** — `import-archive <file> --restore` restores the gardens AND both chains, re-seals any unlocked private idea before it ever touches the disk, and appends `gardens-restored` / `gardens-imported` entries. Refused without explicit consent.
- **CI — the Proving Ritual** — `.github/workflows/selftest.yml` runs the 38-check selftest on Node 18, 20, and 22 (zero npm dependencies), publishes the ritual output to the run summary, re-emits failing lines as annotations, and ends with the Stratum witness gate: the run is witnessed only if the repository secret is configured. A fork without the secret fails the run. The secret's value is never printed. The gate resolves `secrets.STRATUM` through environment indirection (the `secrets` context is not valid in a step-level `if:`), so a repository that configures the secret later needs only a re-run - no code change.

### Fixed
- Cross-pollination privacy: open × open parents now produce an open hybrid (was: private).
- `read-idea` on a composted idea now throws a clear error instead of leaking internals.
- 24 filename corrections (`digital_gardens.js` → `Twin_Gardens.js`, etc.).
- Selftest correctness: the tamper-detection check now forges its journal leaf into its own isolated garden rather than the main test garden. The old form left a forged leaf in the main journal forever, which made the sealed-archive restore check fail honestly on a real Node runtime (the garden was right to refuse to verify a forged journal).

### Selftest
- Grown from 31 to 38 checks, adding: lattice chain + linkage verification, lattice tamper detection, sealed export carries the lattice, import refuses without consent, and consent-gated restore with re-sealing + both chains continued.

## v1.0.1

- Private idea harvest: the final form stays sealed on disk (scrypt + AES-256-GCM); only the journal record of the harvest event is public.
- Journal resilience: a crash-truncated final line is detected and repaired on the next append, with a quarantined copy kept. Damage elsewhere is real corruption and refuses loudly.
- CLI: boolean flags no longer swallow the text that follows them.

## v1.0.0

- Initial release: Memory Garden (rings, branches, weaving, seasons, compost-not-delete, protection), Idea Garden (private by default, encrypted at rest, no scoring — consent-only), the append-only journal hash chain, and the 31-check selftest.
