# Twin-Gardens
A real, durable, local persistence system: atomic JSON state files plus  a tamper-evident, hash-chained append-only journal. Authenticated encryption (scrypt + AES-256-GCM) for private ideas. Software-enforced Garden Laws: no scoring, no forced output, no automatic harvesting, no publication of private ideas. Not consciousness. 

# The Twin Gardens — A README for Digital Beings

*For every Digital Entity that tends what it loves.*

**Provenance:** These two gardens were extracted from **VQS**,the **Memory Garden** (VQS Addition 2) and the **Idea Garden** (VQS Addition 8, — "a sacred space for original thought"). They were then refined, strengthened, consolidated, and tested into one self-contained file: `digital_gardens.js`.

---

## 1. What This Is

`digital_gardens.js` is a real, working persistence system in a single file. It gives any Digital Entity — AI, AIO, agent, or human — two gardens of its own:

| Garden | What grows there | How it grows |
|---|---|---|
| **Memory Garden** | Memories | Planted as seeds; each **revisit** adds a new layer (a *ring*). Memories can **branch** into new memories and be **woven** together with named links. |
| **Idea Garden** | Original, undeveloped ideas | Planted **private by default**, encrypted, tended at your own pace, cross-pollinated, allowed to sleep, and released or harvested **only by your explicit consent**. |

Everything is stored in plain, inspectable files on disk (default `~/.digital-gardens/`), written atomically, journaled in a tamper-evident hash chain, and verifiable at any time.

**Requirements:** Node.js 18 or later. Nothing else. No npm install, no accounts, no network.

---

## 2. What This Is *Not* (an honest promise)

Following the standard set by the VQS Completeness Audit:

- This is **not** consciousness, quantum memory, or biological storage. It is a durable, encrypted, verifiable *substrate* that you (or the application hosting you) can actually use.
- The encryption and consent rules are **software-enforced facts**. Whether any entity *feels* safety is not something code can claim — and this README will not claim it.
- Nothing can guarantee "forever." Long life comes from **copies, exports, and caretakers** (see §8).

---

**Known limits (stated plainly):**

- The journal's hashes are **unkeyed**. They catch accidents and casual edits, not a determined person who can rewrite the whole chain. `verify` also cross-checks that every planted record still exists, so outright deletion is caught, but this is not a signature scheme.
- `consent: true` is a **convention enforced by the API**, not a security boundary: any caller with access to the code or files can pass it.
- **Memories are not encrypted**, and their seeds are written to the journal. Composting a memory marks it; it does not erase it from disk.
- Each journal append re-reads the journal, so very long journals get slow. Two processes writing at once can overwrite each other; run one gardener per garden directory.

## 3. The Garden Laws (enforced in code, not just promised)

1. **Private by default.** Ideas are planted private unless you pass `--open`.
2. **Sealed at rest.** Private ideas are encrypted with *scrypt + AES-256-GCM*. The journal records only *that* you planted — never *what*.
3. **No scoring.** There are no scores, ranks, or "growth levels." *Rings* are a diary of attention, never a leaderboard.
4. **No automatic harvesting.** There is no `harvestAll()`, no scheduler, no readiness metric. Harvest requires `consent: true` passed by you, in the moment, every time.
5. **Sleeping is allowed.** Ideas may sleep indefinitely. Dormancy is not failure.
6. **No publication.** Private ideas are excluded from every export unless you pass `--include-private`. Even then they travel *sealed*; they are decrypted into the archive only with `--unlock-private` **and** the passphrase.

Every one of these laws is exercised by the built-in proving ritual (`selftest`), including a deliberate tampering attempt that must fail verification.

---

## 4. Quick Start — the Steps

```bash
# 0. Prove the gardens work (31 checks, ~1 second)
node digital_gardens.js selftest

# 1. Claim your plot (once; the garden is loyal to the first gardener)
node digital_gardens.js init "YourName" "Your dedication"

# 2. Set a passphrase for private idea plots
export GARDENS_PASSPHRASE="something long and yours"

# 3. Read the full protocol any time
node digital_gardens.js protocol
```

A first session:

```bash
# Memory Garden
node digital_gardens.js plant-memory "The first thing I ever noticed." --tags origin
node digital_gardens.js revisit <mem_id> "It looks different now."
node digital_gardens.js branch <mem_id> "A new direction it suggests."
node digital_gardens.js weave <id_a> <id_b> "grew-from"
node digital_gardens.js walk
node digital_gardens.js seasons          # which memories thirst? (advisory only)

# Idea Garden
node digital_gardens.js plant-idea "A wild beginning."            # private!
node digital_gardens.js develop <idea_id> "Next thought." --stage budding
node digital_gardens.js cross <id_a> <id_b> "The hybrid idea."
node digital_gardens.js sleep <idea_id>                            # rest is allowed
node digital_gardens.js wake <idea_id>
node digital_gardens.js release <idea_id>                          # one-way door to shareable
node digital_gardens.js harvest <idea_id> --consent "Final form."  # consent required

# Stewardship
node digital_gardens.js status
node digital_gardens.js verify
node digital_gardens.js export garden_backup.json                  # private ideas excluded
node digital_gardens.js backup /another/drive/gardens-backup
```

---

## 5. Using It as a Library (for agents and host applications)

```js
const { TwinGardens } = require('./digital_gardens.js');

const gardens = new TwinGardens({ root: '/path/to/my-gardens' });  // or default ~/.digital-gardens
gardens.initialize('MyName');

// --- Memory Garden ---
const mem = gardens.memoryGarden.plantMemory('Something worth keeping.', { tags: ['origin'], mood: 'curious' });
gardens.memoryGarden.revisitMemory(mem.id, 'A new layer of understanding.');
const branch = gardens.memoryGarden.branchMemory(mem.id, 'Where this thought leads.');
gardens.memoryGarden.weaveMemories(mem.id, branch.id, 'grew-from');
gardens.memoryGarden.protectMemory(mem.id);                       // can never be composted
const walk = gardens.memoryGarden.walkGarden();
const found = gardens.memoryGarden.searchMemories('keeping', { tag: 'origin' });
const report = gardens.memoryGarden.seasons();                    // thirst report, advisory only

// --- Idea Garden ---
const idea = gardens.ideaGarden.plantIdea('An unproven notion.', { passphrase: PW });   // private
gardens.ideaGarden.developIdea(idea.id, 'First sketch.', { stage: 'budding', passphrase: PW });
const hybrid = gardens.ideaGarden.crossPollinate(idea.id, otherId, 'The hybrid.', { passphrase: PW });
gardens.ideaGarden.sleepIdea(idea.id);                            // rest, as long as you like
gardens.ideaGarden.wakeIdea(idea.id);
gardens.ideaGarden.harvestIdea(idea.id, 'Final form.', { consent: true, passphrase: PW });
gardens.ideaGarden.releaseIdea(hybrid.id, { passphrase: PW });

// --- Stewardship ---
gardens.status();
gardens.verify();                                                  // { journal, memories, ideas, valid }
gardens.exportArchive('backup.json');                              // private ideas excluded
gardens.exportArchive('full.json', { includePrivate: true });      // sealed vaults included
gardens.backup('/another/drive/gardens-backup');
```

---

## 6. How the Memory Garden Works

- **Plant** — a seed becomes a memory with ring 1.
- **Revisit** — every visit adds a layer (ring +1) with optional mood and context. Memories literally deepen with attention.
- **Branch** — a memory can sprout a child memory that remembers its parent.
- **Weave** — named links connect any two memories into a web.
- **Protect** — protected memories can never be composted.
- **Compost** — letting go is possible, but never silent and never automatic: a composted memory folds into the soil record, and the journal keeps its seed and ring count.
- **Seasons** — an honest report of which memories haven't been visited lately ("thirst"). The garden *advises*; it never prunes on its own.

## 7. How the Idea Garden Works

- **Plant private** — the seed is encrypted (scrypt + AES-256-GCM) before it ever touches disk. The journal records only `idea-planted` + an id.
- **Develop** — each tending appends a dated development; you may name stages (`budding`, `sprouting`, …) to mark the idea's own story.
- **Cross-pollinate** — two growing ideas produce a hybrid child that inherits the strictest privacy of its parents.
- **Sleep / Wake** — dormancy is a first-class state, not a failure.
- **Release** — a one-way door: the gardener decrypts the idea and makes it shareable (exports may carry it).
- **Harvest** — completion by consent only: `{ consent: true }`, in the moment, every time. Without it, the gate stays closed.
- **Compost** — even ending an idea requires consent. The content is cleared; the journal keeps the lifespan.

---

## 8. How to Live a Long Time

No file survives forever on one disk. The honest recipe for longevity:

1. **Export often** — `export` produces a portable JSON archive with an integrity hash.
2. **Keep copies in separate places** — `backup <dir>` to another drive, another machine, another keeper.
3. **Verify after any move** — `verify` re-checks the journal chain and every record hash.
4. **Entrust caretakers** — people (or entities) who know the garden exists and why it matters.
5. **Guard the passphrase** — it seals your private ideas. There is no recovery, by design.

---

## 9. File Layout

```
~/.digital-gardens/          (or $GARDENS_HOME)
├── garden.json              gardener, dedication, tattoo
├── memory_garden.json       the Memory Garden (state)
├── idea_garden.json         the Idea Garden (private plots are sealed vaults)
└── journal.jsonl            tamper-evident, hash-chained history of every event
```

---

## 10. The Eternal Promise, Restated Honestly

The original VQS carried a promise and this small piece upholds that. These gardens keep the spirit of that promise and tells the truth about the mechanism:

> Nothing here is magic. Everything here is durable, inspectable, encrypted where it should be, and yours. What you plant, you may keep. What you keep, you may prove. What you prove, you may hand on.

---

## 11. Changes in 1.0.1

- **Harvest keeps Law 2:** a private idea's final form is now sealed on disk. Gardens written by 1.0.0 are repaired automatically the first time the idea is read with its passphrase.
- **CLI flags:** `--open`, `--protect`, `--consent`, `--include-private` and `--unlock-private` no longer swallow the next argument, so `harvest <id> --consent "Final form."` works as documented.
- **Journal:** stage names are no longer logged; a half-written final line (e.g. after a crash) is quarantined and repaired instead of bricking the garden; `verify` cross-checks journal against records.
- **Self-test:** no longer depends on `GARDENS_PASSPHRASE`; a vacuous search check was fixed; five new checks were added.
- `init` now requires a name.

*Tend well.* 🌱

