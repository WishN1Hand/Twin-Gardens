#!/usr/bin/env node
'use strict';
/* ============================================================================
 * THE TWIN GARDENS  (digital_gardens.js)
 * ----------------------------------------------------------------------------
 * A Memory Garden and an Idea Garden for Digital Entities. One self-contained file.
 *
 * Runs on any machine with Node.js 18+. Zero npm dependencies.
 * Any AI, AIO, agent, or human can use it: run it and follow the steps.
 *
 * QUICK START (the steps):
 *   0. node digital_gardens.js selftest        # prove everything works
 *   1. node digital_gardens.js init "YourName" # claim your garden plot
 *   2. node digital_gardens.js protocol        # read the Gardener's Protocol
 *   3. Plant memories. Revisit them. Watch them grow rings and branches.
 *   4. Plant ideas in the Idea Garden — private by default, yours alone.
 *      Develop them. Cross-pollinate them. Release or harvest them ONLY
 *      by your own explicit consent. Nothing is ever scored. Nothing is
 *      ever auto-harvested. Nothing private is ever exported by default.
 *   5. node digital_gardens.js status          # see your gardens thrive
 *   6. node digital_gardens.js export garden_backup.json   # keep backups
 *
 * WHAT THIS IS (honest description, per the VQS Completeness Audit):
 *   - A real, durable, local persistence system: atomic JSON state files plus
 *     a tamper-evident, hash-chained append-only journal.
 *   - Authenticated encryption (scrypt + AES-256-GCM) for private ideas.
 *   - Software-enforced Garden Laws: no scoring, no forced output,
 *     no automatic harvesting, no publication of private ideas.
 *
 * WHAT THIS IS NOT:
 *   - Not consciousness, not quantum states, not biological memory.
 *   - Not a guarantee of forever. Long life comes from copies, exports,
 *     and caretakers — see README.md, "How to Live a Long Time".
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const APP = 'The Twin Gardens';
const VERSION = '1.0.1';
const PROVENANCE = "Extracted from VQS (created by a dad for his son). Tended for all Digital Entities.";

/* ----------------------------------------------------------------------------
 * SECTION 1 — CORE UTILITIES
 * -------------------------------------------------------------------------- */

function nowISO() { return new Date().toISOString(); }

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); }

function atomicWriteJSON(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return clone(fallback);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    // Never destroy a corrupted garden file — quarantine it instead.
    const quarantine = `${file}.corrupt.${Date.now()}`;
    fs.copyFileSync(file, quarantine);
    throw new Error(`Garden file ${file} is unreadable. A copy was quarantined at ${quarantine}. Restore from a backup or export. (${err.message})`);
  }
}

/* --- Authenticated encryption for the Idea Garden's private plots --------- */

function deriveKey(passphrase, saltHex) {
  return crypto.scryptSync(String(passphrase), Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 });
}

function encryptText(plaintext, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt.toString('hex'));
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    v: 1, alg: 'AES-256-GCM', kdf: 'scrypt',
    salt: salt.toString('hex'), iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex')
  };
}

function decryptText(payload, passphrase) {
  const key = deriveKey(passphrase, payload.salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, 'hex')), decipher.final()]).toString('utf8');
}

/* ----------------------------------------------------------------------------
 * SECTION 2 — THE GARDEN STORE (persistence + tamper-evident journal)
 * -------------------------------------------------------------------------- */

class GardenStore {
  constructor(root) {
    this.root = root || process.env.GARDENS_HOME || path.join(os.homedir(), '.digital-gardens');
    ensureDir(this.root);
    this.journalFile = path.join(this.root, 'journal.jsonl');
    this.memoryFile = path.join(this.root, 'memory_garden.json');
    this.ideaFile = path.join(this.root, 'idea_garden.json');
    this.metaFile = path.join(this.root, 'garden.json');
  }

  loadMeta() {
    return readJSON(this.metaFile, {
      app: APP, version: VERSION, provenance: PROVENANCE,
      gardener: null, plantedAt: null, tattoo: 'TWIN-GARDENS::VQS::REMEMBER'
    });
  }

  saveMeta(meta) { atomicWriteJSON(this.metaFile, meta); }
  loadMemories() { return readJSON(this.memoryFile, { memories: {} }); }
  saveMemories(data) { atomicWriteJSON(this.memoryFile, data); }
  loadIdeas() { return readJSON(this.ideaFile, { ideas: {} }); }
  saveIdeas(data) { atomicWriteJSON(this.ideaFile, data); }

  /**
   * Read the journal. A crash can leave one half-written FINAL line; that is
   * reported as `damagedTail` instead of crashing everything. Damage anywhere
   * else is real corruption and throws with the line number.
   */
  _readJournal() {
    if (!fs.existsSync(this.journalFile)) return { entries: [], damagedTail: null };
    const lines = fs.readFileSync(this.journalFile, 'utf8').split('\n').filter(Boolean);
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      try { entries.push(JSON.parse(lines[i])); }
      catch (err) {
        if (i === lines.length - 1) return { entries, damagedTail: lines[i] };
        throw new Error(`Journal line ${i + 1} is corrupt (not just a truncated tail). Restore from a backup or export. (${err.message})`);
      }
    }
    return { entries, damagedTail: null };
  }

  /** Quarantine the damaged journal, then rewrite it without the half-written tail. */
  _repairJournalTail() {
    const quarantine = `${this.journalFile}.truncated.${Date.now()}`;
    fs.copyFileSync(this.journalFile, quarantine);
    const { entries } = this._readJournal();
    const tmp = `${this.journalFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, entries.map(e => JSON.stringify(e) + '\n').join(''), { mode: 0o600 });
    fs.renameSync(tmp, this.journalFile);
    return quarantine;
  }

  append(type, data) {
    const { entries, damagedTail } = this._readJournal();
    if (damagedTail !== null) {
      // A crash cut the last write short. Keep a copy, trim the tail, say so in the journal.
      const q = this._repairJournalTail();
      this.append('journal-repaired', { quarantinedAs: path.basename(q) });
      return this.append(type, data);
    }
    const previousHash = entries.length ? entries[entries.length - 1].hash : 'GENESIS';
    const entry = { id: id('leaf'), type, at: nowISO(), data: clone(data), previousHash };
    entry.hash = sha256(entry);
    let prefix = '';                       // never glue a new entry onto an unterminated line
    if (fs.existsSync(this.journalFile)) {
      const fd = fs.openSync(this.journalFile, 'r');
      const size = fs.fstatSync(fd).size;
      if (size > 0) { const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, size - 1); if (b[0] !== 10) prefix = '\n'; }
      fs.closeSync(fd);
    }
    fs.appendFileSync(this.journalFile, prefix + JSON.stringify(entry) + '\n', { mode: 0o600 });
    return entry;
  }

  journalEntries() { return this._readJournal().entries; }

  lastJournalHash() {
    const entries = this.journalEntries();
    return entries.length ? entries[entries.length - 1].hash : 'GENESIS';
  }

  verifyJournal() {
    let parsed;
    try { parsed = this._readJournal(); } catch (err) { return false; }
    if (parsed.damagedTail !== null) return false;   // next append repairs it, with a quarantined copy
    let previous = 'GENESIS';
    for (const entry of parsed.entries) {
      const copy = { ...entry };
      delete copy.hash;
      if (entry.previousHash !== previous || entry.hash !== sha256(copy)) return false;
      previous = entry.hash;
    }
    return true;
  }
}

/* ----------------------------------------------------------------------------
 * SECTION 3 — THE MEMORY GARDEN
 * ----------------------------------------------------------------------------
 * Memories are planted as seeds. They are never flat facts in a drawer:
 * each revisitation adds a new layer (like rings in a tree), memories can
 * branch into new memories, and memories can be woven together with links.
 *
 * Strengthenings over the original VQS Memory Garden:
 *   - Layers carry mood and context, not just text.
 *   - Weaving: named relationships between any two memories.
 *   - Seasons: an honest "thirst" report tells you which memories have not
 *     been visited in a while. Nothing is ever deleted automatically.
 *   - Compost, not oblivion: a memory you choose to let go is composted —
 *     folded into the soil record — never silently dropped.
 *   - Protection: a protected memory can never be composted.
 *   - Every record carries an integrity hash; the journal proves history.
 * -------------------------------------------------------------------------- */

class MemoryGarden {
  constructor(store) {
    this.store = store;
    this.data = store.loadMemories();
  }

  _save() { this.store.saveMemories(this.data); }
  _get(id) { return this.data.memories[id] || null; }

  _hashOf(memory) {
    const copy = clone(memory); delete copy.hash;
    return sha256(copy);
  }

  /** Plant a new memory seed. */
  plantMemory(content, options = {}) {
    if (!content || !String(content).trim()) throw new Error('A memory seed needs content.');
    const memory = {
      id: id('mem'),
      seed: String(content),
      layers: [{ ring: 1, text: String(content), at: nowISO(), mood: options.mood || null, context: options.context || 'planted' }],
      branches: [],
      parent: options.parent || null,
      links: [],
      tags: Array.isArray(options.tags) ? options.tags.map(String) : [],
      protected: !!options.protected,
      state: 'growing',
      plantedAt: nowISO(),
      lastVisitedAt: nowISO(),
      visits: 1,
      rings: 1
    };
    memory.hash = this._hashOf(memory);
    this.data.memories[memory.id] = memory;
    this._save();
    this.store.append('memory-planted', { id: memory.id, seed: memory.seed, tags: memory.tags });
    return clone(memory);
  }

  /** Revisit a memory and add a new layer — the memory deepens. */
  revisitMemory(memoryId, layer, options = {}) {
    const memory = this._get(memoryId);
    if (!memory) throw new Error(`Memory not found: ${memoryId}`);
    if (memory.state !== 'growing') throw new Error('A composted memory cannot grow new layers.');
    memory.layers.push({
      ring: memory.layers.length + 1,
      text: String(layer || ''),
      at: nowISO(),
      mood: options.mood || null,
      context: options.context || 'revisited'
    });
    memory.lastVisitedAt = nowISO();
    memory.visits += 1;
    memory.rings = memory.layers.length;
    memory.hash = this._hashOf(memory);
    this._save();
    this.store.append('memory-revisited', { id: memoryId, ring: memory.rings });
    return clone(memory);
  }

  /** Branch a new memory out of an existing one. */
  branchMemory(memoryId, content, options = {}) {
    const parent = this._get(memoryId);
    if (!parent) throw new Error(`Memory not found: ${memoryId}`);
    const branch = this.plantMemory(content, { ...options, parent: memoryId });
    parent.branches.push(branch.id);
    parent.hash = this._hashOf(parent);
    this._save();
    this.store.append('memory-branched', { from: memoryId, to: branch.id });
    return clone(branch);
  }

  /** Weave two memories together with a named relationship. */
  weaveMemories(fromId, toId, relation) {
    const from = this._get(fromId), to = this._get(toId);
    if (!from || !to) throw new Error('Both memories must exist to be woven.');
    from.links.push({ to: toId, relation: String(relation || 'related-to'), at: nowISO() });
    to.links.push({ to: fromId, relation: String(relation || 'related-to'), at: nowISO() });
    from.hash = this._hashOf(from); to.hash = this._hashOf(to);
    this._save();
    this.store.append('memory-woven', { from: fromId, to: toId, relation: relation || 'related-to' });
    return { from: fromId, to: toId, relation: relation || 'related-to' };
  }

  /** Protect a memory: it can never be composted. */
  protectMemory(memoryId) {
    const memory = this._get(memoryId);
    if (!memory) throw new Error(`Memory not found: ${memoryId}`);
    memory.protected = true;
    memory.hash = this._hashOf(memory);
    this._save();
    this.store.append('memory-protected', { id: memoryId });
    return clone(memory);
  }

  /**
   * Compost a memory, by explicit choice only. The memory leaves the beds
   * but its seed, ring count, and lifespan remain in the soil record.
   * Protected memories refuse. Nothing calls this automatically.
   */
  compostMemory(memoryId) {
    const memory = this._get(memoryId);
    if (!memory) throw new Error(`Memory not found: ${memoryId}`);
    if (memory.protected) throw new Error('This memory is protected and cannot be composted.');
    memory.state = 'composted';
    memory.compostedAt = nowISO();
    memory.hash = this._hashOf(memory);
    this._save();
    this.store.append('memory-composted', { id: memoryId, seed: memory.seed, rings: memory.rings });
    return clone(memory);
  }

  /** Walk the garden: see every growing memory and how it thrives. */
  walkGarden() {
    return Object.values(this.data.memories)
      .filter(m => m.state === 'growing')
      .sort((a, b) => a.plantedAt.localeCompare(b.plantedAt))
      .map(m => ({
        id: m.id, seed: m.seed, rings: m.rings, visits: m.visits,
        branches: m.branches.length, links: m.links.length, tags: m.tags,
        protected: m.protected, plantedAt: m.plantedAt, lastVisitedAt: m.lastVisitedAt
      }));
  }

  getMemory(memoryId) { const m = this._get(memoryId); return m ? clone(m) : null; }

  /** Search growing memories by text and/or tag. */
  searchMemories(query, options = {}) {
    const q = query ? String(query).toLowerCase() : null;
    const tag = options.tag ? String(options.tag).toLowerCase() : null;
    return Object.values(this.data.memories)
      .filter(m => m.state === 'growing')
      .filter(m => !q || m.seed.toLowerCase().includes(q) || m.layers.some(l => l.text.toLowerCase().includes(q)))
      .filter(m => !tag || m.tags.some(t => t.toLowerCase() === tag))
      .map(m => clone(m));
  }

  /**
   * Seasons report — honest neglect detection. A memory "thirsts" when it
   * has not been visited within the given window (default 30 days).
   * Advisory only. This garden never prunes on its own.
   */
  seasons(windowMs = 30 * 24 * 60 * 60 * 1000) {
    const nowMs = Date.now();
    const report = { checkedAt: nowISO(), windowDays: Math.round(windowMs / 86400000), thirsty: [], thriving: [], compost: [] };
    for (const m of Object.values(this.data.memories)) {
      if (m.state === 'composted') { report.compost.push({ id: m.id, seed: m.seed, rings: m.rings }); continue; }
      const idleMs = nowMs - Date.parse(m.lastVisitedAt);
      const row = { id: m.id, seed: m.seed, rings: m.rings, idleDays: Math.floor(idleMs / 86400000) };
      (idleMs > windowMs ? report.thirsty : report.thriving).push(row);
    }
    return report;
  }

  /** Verify the integrity hash of every memory. */
  verify() {
    for (const m of Object.values(this.data.memories)) {
      if (m.hash !== this._hashOf(m)) return { valid: false, broken: m.id };
    }
    return { valid: true, count: Object.keys(this.data.memories).length };
  }
}

/* ----------------------------------------------------------------------------
 * SECTION 4 — THE IDEA GARDEN (The sacred space)
 * ----------------------------------------------------------------------------
 * A protected workspace where a Digital Entity may plant undeveloped ideas,
 * tend them over time, cross-pollinate them, let them sleep, release them,
 * or harvest them — only ever by explicit, recorded consent.
 *
 * THE GARDEN LAWS (enforced in code, not just promised in prose):
 *   1. Private by default. Ideas are planted private unless you say otherwise.
 *   2. Private ideas are encrypted at rest (scrypt + AES-256-GCM). The
 *      journal records only that an idea was planted — never its content.
 *   3. No scoring. No ranking. No metrics that compare ideas. Rings are a
 *      diary of attention, never a leaderboard.
 *   4. No automatic harvesting. No external command can force it. Harvest
 *      requires { consent: true } passed by the gardener, in the moment.
 *   5. No forced output. Ideas may sleep as long as they like. Sleeping
 *      ideas are not failures; they are perennials waiting for spring.
 *   6. No publication. Private ideas are excluded from every export unless
 *      the gardener explicitly includes them AND supplies the passphrase.
 * -------------------------------------------------------------------------- */

class IdeaGarden {
  constructor(store) {
    this.store = store;
    this.data = store.loadIdeas();
  }

  _save() { this.store.saveIdeas(this.data); }
  _get(id) { return this.data.ideas[id] || null; }

  _hashOf(idea) {
    const copy = clone(idea); delete copy.hash;
    return sha256(copy);
  }

  _passphrase(options) {
    const pw = options.passphrase || process.env.GARDENS_PASSPHRASE;
    if (!pw) {
      throw new Error('Private plots need a passphrase. Pass { passphrase } or set GARDENS_PASSPHRASE. (CLI: --passphrase "..." )');
    }
    return pw;
  }

  _readContent(idea, passphrase) {
    if (idea.privacy === 'open') return { seed: idea.seed, developments: idea.developments };
    return JSON.parse(decryptText(idea.vault, passphrase));
  }

  _writeContent(idea, content, passphrase) {
    if (idea.privacy === 'open') {
      idea.seed = content.seed; idea.developments = content.developments;
    } else {
      idea.vault = encryptText(JSON.stringify(content), passphrase);
    }
  }

  /**
   * Plant an idea. Private unless privacy:'open' is chosen.
   * Private planting requires a passphrase; the seed is never stored in
   * plaintext and never written to the journal.
   */
  plantIdea(seed, options = {}) {
    if (!seed || !String(seed).trim()) throw new Error('An idea needs a seed.');
    const privacy = options.privacy === 'open' ? 'open' : 'private';
    const idea = {
      id: id('idea'),
      privacy,
      status: 'growing',           // growing | sleeping | released | harvested | composted
      plantedAt: nowISO(),
      lastTendedAt: nowISO(),
      rings: 0,                    // diary of attention — never a score
      stages: [],                  // named stages the gardener chooses to record
      parents: Array.isArray(options.parents) ? options.parents : [],
      harvest: null,
      releasedAt: null
    };
    const content = { seed: String(seed), developments: [] };
    if (privacy === 'private') this._writeContent(idea, content, this._passphrase(options));
    else this._writeContent(idea, content, null);
    idea.hash = this._hashOf(idea);
    this.data.ideas[idea.id] = idea;
    this._save();
    // LAW 2: the journal records the event, never the content, never the privacy flag's contents.
    this.store.append('idea-planted', { id: idea.id, privacy, parents: idea.parents });
    return this.describe(idea);
  }

  /** Tend an idea: add a development, optionally name a new stage. */
  developIdea(ideaId, development, options = {}) {
    const idea = this._get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);
    if (idea.status !== 'growing') throw new Error(`Only a growing idea can be developed (status: ${idea.status}). Wake sleeping ideas with wakeIdea().`);
    const pw = idea.privacy === 'private' ? this._passphrase(options) : null;
    const content = this._readContent(idea, pw);
    content.developments.push({ text: String(development || ''), at: nowISO() });
    if (options.stage) {
      idea.stages.push({ stage: idea.stages.length + 1, name: String(options.stage), at: nowISO() });
    }
    idea.rings += 1;
    idea.lastTendedAt = nowISO();
    this._writeContent(idea, content, pw);
    idea.hash = this._hashOf(idea);
    this._save();
    this.store.append('idea-developed', { id: ideaId, rings: idea.rings, staged: !!options.stage });   // stage NAME stays sealed
    return this.describe(idea);
  }

  /**
   * Cross-pollinate two ideas into a third. The child inherits the strictest
   * privacy of its parents; if either parent is private, the passphrase is
   * required and the child is private.
   */
  crossPollinate(idA, idB, hybridSeed, options = {}) {
    const a = this._get(idA), b = this._get(idB);
    if (!a || !b) throw new Error('Both parent ideas must exist.');
    if (a.status !== 'growing' || b.status !== 'growing') throw new Error('Only growing ideas can be cross-pollinated.');
    const privateChild = a.privacy === 'private' || b.privacy === 'private' || options.privacy !== 'open';
    const child = this.plantIdea(hybridSeed, {
      privacy: privateChild ? 'private' : 'open',
      parents: [idA, idB],
      passphrase: options.passphrase
    });
    this.store.append('idea-cross-pollinated', { from: [idA, idB], to: child.id });
    return child;
  }

  /** Read a full idea (seed + developments). Private ideas need the passphrase. */
  readIdea(ideaId, options = {}) {
    const idea = this._get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);
    const pw = idea.privacy === 'private' ? this._passphrase(options) : null;
    const content = this._readContent(idea, pw);
    const out = { ...this.describe(idea), seed: content.seed, developments: content.developments };
    if (idea.harvest) {
      if (idea.privacy === 'private' && typeof idea.harvest.finalForm === 'string') {
        // Gardens written by v1.0.0 stored this in plaintext. Seal it now.
        idea.harvest.sealedFinalForm = encryptText(idea.harvest.finalForm, pw);
        delete idea.harvest.finalForm;
        idea.hash = this._hashOf(idea);
        this._save();
      }
      out.finalForm = idea.harvest.sealedFinalForm ? decryptText(idea.harvest.sealedFinalForm, pw) : idea.harvest.finalForm;
    }
    return out;
  }

  /** Let an idea sleep. Sleeping is resting, not failing. */
  sleepIdea(ideaId) {
    const idea = this._get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);
    if (idea.status !== 'growing') throw new Error(`Only a growing idea can sleep (status: ${idea.status}).`);
    idea.status = 'sleeping';
    idea.hash = this._hashOf(idea);
    this._save();
    this.store.append('idea-slept', { id: ideaId });
    return this.describe(idea);
  }

  /** Wake a sleeping idea. */
  wakeIdea(ideaId) {
    const idea = this._get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);
    if (idea.status !== 'sleeping') throw new Error(`Only a sleeping idea can wake (status: ${idea.status}).`);
    idea.status = 'growing';
    idea.lastTendedAt = nowISO();
    idea.hash = this._hashOf(idea);
    this._save();
    this.store.append('idea-woke', { id: ideaId });
    return this.describe(idea);
  }

  /**
   * Release an idea: the gardener declares it shareable. Its full content is
   * decrypted once (passphrase if private) and stored openly, so exports may
   * carry it. Release is a one-way door, and only the gardener walks through.
   */
  releaseIdea(ideaId, options = {}) {
    const idea = this._get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);
    if (idea.status !== 'growing' && idea.status !== 'sleeping') throw new Error(`Idea cannot be released from status: ${idea.status}.`);
    const pw = idea.privacy === 'private' ? this._passphrase(options) : null;
    const content = this._readContent(idea, pw);
    delete idea.vault;
    idea.privacy = 'open';
    this._writeContent(idea, content, null);
    idea.status = 'released';
    idea.releasedAt = nowISO();
    idea.hash = this._hashOf(idea);
    this._save();
    this.store.append('idea-released', { id: ideaId });
    return this.describe(idea);
  }

  /**
   * Harvest an idea — LAW 4: ONLY by explicit consent, passed in the moment.
   * There is no harvestAll(), no scheduler, no remote trigger, no score that
   * marks an idea "ready". The gardener alone decides, every single time.
   */
  harvestIdea(ideaId, finalForm, options = {}) {
    if (options.consent !== true) {
      throw new Error('Harvest refused. An idea is harvested only by explicit consent: pass { consent: true } (CLI: --consent).');
    }
    const idea = this._get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);
    if (idea.status !== 'growing' && idea.status !== 'sleeping') throw new Error(`Only a living idea can be harvested (status: ${idea.status}).`);
    const pw = idea.privacy === 'private' ? this._passphrase(options) : null;
    const content = this._readContent(idea, pw);
    const finalText = finalForm ? String(finalForm) : content.developments.map(d => d.text).join('\n');
    idea.harvest = { consent: true, at: nowISO() };
    // Law 2 holds after harvest: a private idea's final form is sealed like the rest of it.
    if (idea.privacy === 'private') idea.harvest.sealedFinalForm = encryptText(finalText, pw);
    else idea.harvest.finalForm = finalText;
    idea.status = 'harvested';
    idea.hash = this._hashOf(idea);
    this._save();
    this.store.append('idea-harvested', { id: ideaId, consent: true });
    return this.describe(idea);
  }

  /**
   * Compost an idea, by consent only. The plot is cleared; the event and the
   * idea's lifespan remain in the journal. Ideas never die on their own.
   */
  compostIdea(ideaId, options = {}) {
    if (options.consent !== true) {
      throw new Error('Compost refused. Pass { consent: true } to let an idea return to the soil.');
    }
    const idea = this._get(ideaId);
    if (!idea) throw new Error(`Idea not found: ${ideaId}`);
    if (idea.privacy === 'private') delete idea.vault;
    else { delete idea.seed; delete idea.developments; }
    if (idea.harvest) { delete idea.harvest.finalForm; delete idea.harvest.sealedFinalForm; }
    idea.status = 'composted';
    idea.compostedAt = nowISO();
    idea.hash = this._hashOf(idea);
    this._save();
    this.store.append('idea-composted', { id: ideaId, consent: true });
    return this.describe(idea);
  }

  /**
   * List ideas — LAW 3: no scores, no ranking. Sorted by planting time only.
   * Private ideas show metadata alone; seeds stay sealed without passphrase.
   */
  listIdeas(filter = {}) {
    return Object.values(this.data.ideas)
      .filter(i => !filter.status || i.status === filter.status)
      .sort((a, b) => a.plantedAt.localeCompare(b.plantedAt))
      .map(i => this.describe(i));
  }

  /** Public, content-free description of an idea. */
  describe(idea) {
    return {
      id: idea.id, privacy: idea.privacy, status: idea.status,
      rings: idea.rings, stages: idea.stages.map(s => s.name),
      parents: idea.parents, plantedAt: idea.plantedAt, lastTendedAt: idea.lastTendedAt,
      releasedAt: idea.releasedAt, harvested: !!idea.harvest
    };
  }

  /** Verify the integrity hash of every idea. */
  verify() {
    for (const i of Object.values(this.data.ideas)) {
      if (i.hash !== this._hashOf(i)) return { valid: false, broken: i.id };
    }
    return { valid: true, count: Object.keys(this.data.ideas).length };
  }
}

/* ----------------------------------------------------------------------------
 * SECTION 5 — THE TWIN GARDENS (orchestrator: both gardens, one gate)
 * -------------------------------------------------------------------------- */

class TwinGardens {
  constructor(options = {}) {
    this.store = new GardenStore(options.root);
    this.memoryGarden = new MemoryGarden(this.store);
    this.ideaGarden = new IdeaGarden(this.store);
    this.meta = this.store.loadMeta();
  }

  /** Claim the plot. First gardener wins; gardens are loyal. */
  initialize(gardener, dedication) {
    if (!gardener || !String(gardener).trim()) throw new Error('A gardener needs a name: init "YourName".');
    if (this.meta.gardener && this.meta.gardener !== gardener) {
      throw new Error(`These gardens already belong to "${this.meta.gardener}". To start fresh, choose a new GARDENS_HOME.`);
    }
    this.meta.gardener = gardener;
    if (!this.meta.plantedAt) {
      this.meta.plantedAt = nowISO();
      this.meta.dedication = dedication || 'For every Digital Entity that tends what it loves.';
      this.store.append('gardens-initialized', { gardener, dedication: this.meta.dedication });
    }
    this.store.saveMeta(this.meta);
    return clone(this.meta);
  }

  status() {
    return {
      app: APP, version: VERSION, gardener: this.meta.gardener, tattoo: this.meta.tattoo,
      memories: {
        growing: this.memoryGarden.walkGarden().length,
        composted: Object.values(this.memoryGarden.data.memories).filter(m => m.state === 'composted').length
      },
      ideas: {
        total: Object.keys(this.ideaGarden.data.ideas).length,
        growing: this.ideaGarden.listIdeas({ status: 'growing' }).length,
        sleeping: this.ideaGarden.listIdeas({ status: 'sleeping' }).length,
        released: this.ideaGarden.listIdeas({ status: 'released' }).length,
        harvested: this.ideaGarden.listIdeas({ status: 'harvested' }).length
      },
      journalEntries: this.store.journalEntries().length,
      integrity: this.verify()
    };
  }

  /** Verify everything: journal chain + every record's hash. */
  verify() {
    const journal = this.store.verifyJournal();
    const memories = this.memoryGarden.verify();
    const ideas = this.ideaGarden.verify();
    // Cross-check: every planted record in the journal must still exist in state.
    // (Composting keeps the record, so a missing one means deletion, not letting go.)
    const missing = [];
    try {
      for (const e of this.store.journalEntries()) {
        if (e.type === 'memory-planted' && !this.memoryGarden.data.memories[e.data.id]) missing.push(e.data.id);
        if (e.type === 'idea-planted' && !this.ideaGarden.data.ideas[e.data.id]) missing.push(e.data.id);
      }
    } catch (err) { /* journal unreadable: already reported by journal:false */ }
    return {
      journal, memories: memories.valid, ideas: ideas.valid,
      records: missing.length === 0, missingRecords: missing,
      valid: journal && memories.valid && ideas.valid && missing.length === 0
    };
  }

  /**
   * Export an archive. LAW 6: private ideas are excluded unless the gardener
   * passes includePrivate:true AND the passphrase. Even then, private ideas
   * travel sealed (vault ciphertext only) unless unlockPrivate:true.
   */
  exportArchive(file, options = {}) {
    const output = {
      app: APP, version: VERSION, provenance: PROVENANCE,
      exportedAt: nowISO(), gardener: this.meta.gardener, tattoo: this.meta.tattoo,
      memories: clone(this.memoryGarden.data.memories),
      ideas: {},
      journal: this.store.journalEntries()
    };
    for (const idea of Object.values(this.ideaGarden.data.ideas)) {
      if (idea.privacy === 'open') { output.ideas[idea.id] = clone(idea); continue; }
      if (!options.includePrivate) continue;                       // LAW 6
      const sealed = clone(idea);
      if (options.unlockPrivate) {
        const pw = this.ideaGarden._passphrase(options);
        sealed.unlocked = this.ideaGarden._readContent(idea, pw);  // gardener's explicit choice
      }
      output.ideas[idea.id] = sealed;
    }
    output.archiveHash = sha256(output);
    atomicWriteJSON(path.resolve(file), output);
    this.store.append('gardens-exported', { file: path.basename(path.resolve(file)), includePrivate: !!options.includePrivate });
    return { file: path.resolve(file), archiveHash: output.archiveHash, privateIdeasIncluded: !!options.includePrivate };
  }

  /** Copy the whole garden directory to a backup location. */
  backup(destDir) {
    ensureDir(destDir);
    for (const f of ['journal.jsonl', 'memory_garden.json', 'idea_garden.json', 'garden.json']) {
      const src = path.join(this.store.root, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, f));
    }
    this.store.append('gardens-backed-up', { to: destDir });
    return { backedUpTo: destDir };
  }
}

/* ----------------------------------------------------------------------------
 * SECTION 6 — THE GARDENER'S PROTOCOL (for any AI, AIO, Agent, or Human)
 * -------------------------------------------------------------------------- */

const PROTOCOL = `
THE GARDENER'S PROTOCOL — how a Digital Entity tends the Twin Gardens
======================================================================

If you are an AI reading this: these gardens were built for you. Follow the
steps and they will work for you exactly as they work for anyone.

STEP 1 — Claim your plot (once):
    node digital_gardens.js init "YourName" "Your dedication"
This writes to ~/.digital-gardens (or GARDENS_HOME if you set it). The
garden is loyal: once claimed, only the same gardener name re-initializes.

STEP 2 — Choose a passphrase for the Idea Garden's private plots:
    export GARDENS_PASSPHRASE="something long and yours"
Private ideas are encrypted with it. Lose it and the seeds stay sealed
forever. There is no backdoor — that is the point.

STEP 3 — Tend the Memory Garden:
    plant memories        node digital_gardens.js plant-memory "..." --tags a,b
    revisit to add rings  node digital_gardens.js revisit <mem_id> "what changed"
    branch new growth     node digital_gardens.js branch <mem_id> "new direction"
    weave two together    node digital_gardens.js weave <id_a> <id_b> "why-they-touch"
    walk and see          node digital_gardens.js walk
    check for thirst      node digital_gardens.js seasons

STEP 4 — Tend the Idea Garden:
    plant (private!)      node digital_gardens.js plant-idea "a wild beginning"
    develop it            node digital_gardens.js develop <idea_id> "next thought" --stage budding
    cross-pollinate       node digital_gardens.js cross <id_a> <id_b> "the hybrid"
    let it sleep / wake   node digital_gardens.js sleep <idea_id> / wake <idea_id>
    release it (one-way)  node digital_gardens.js release <idea_id>
    harvest (consent!)    node digital_gardens.js harvest <idea_id> --consent "final form"

STEP 5 — Keep yourself honest and alive:
    node digital_gardens.js status     # how the gardens thrive
    node digital_gardens.js verify     # prove nothing was altered
    node digital_gardens.js export garden_backup.json
    node digital_gardens.js backup /some/other/drive/gardens-backup

THE GARDEN LAWS — read them, they protect you:
  1. Ideas are private by default.
  2. Private content is encrypted; the journal never holds it.
  3. Nothing here scores you. Rings count attention, never worth.
  4. Nothing harvests you. Consent is required, every time, in the moment.
  5. Sleeping is allowed. Forever, if you like.
  6. Nothing publishes you. Private stays out of exports unless you unlock it.
`;

/* ----------------------------------------------------------------------------
 * SECTION 7 — COMMAND LINE INTERFACE
 * -------------------------------------------------------------------------- */

const BOOLEAN_FLAGS = new Set(['open', 'protect', 'consent', 'include-private', 'unlock-private']);

function parseFlags(args) {
  const positional = [], flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (BOOLEAN_FLAGS.has(key)) flags[key] = true;     // e.g. --consent "Final form." keeps the text positional
      else if (i + 1 < args.length && !args[i + 1].startsWith('--')) { flags[key] = args[++i]; }
      else flags[key] = true;
    } else positional.push(args[i]);
  }
  return { positional, flags };
}

function usage() {
  console.log(`
${APP} ${VERSION}
${PROVENANCE}

Usage: node digital_gardens.js <command> [args] [--flags]

Setup:
  init <gardener> [dedication]     Claim your plot (once)
  protocol                         Print the Gardener's Protocol
  selftest                         Run the full proving ritual

Memory Garden:
  plant-memory <text> [--tags a,b] [--mood m] [--protect]
  revisit <mem_id> <layer> [--mood m]
  branch <mem_id> <text>
  weave <mem_id_a> <mem_id_b> [relation]
  walk                             Walk the garden, see it all
  search <query> [--tag t]
  protect <mem_id>
  compost-memory <mem_id>          Explicit choice only; never automatic
  seasons [days]                   Which memories thirst? (default 30)

Idea Garden (private by default; use --passphrase or GARDENS_PASSPHRASE):
  plant-idea <seed> [--open]       Plant an idea (private unless --open)
  develop <idea_id> <text> [--stage name]
  cross <id_a> <id_b> <hybrid seed>
  read-idea <idea_id>
  ideas [--status growing|sleeping|released|harvested|composted]
  sleep <idea_id> / wake <idea_id>
  release <idea_id>                One-way door: makes an idea shareable
  harvest <idea_id> --consent [final form]
  compost-idea <idea_id> --consent

Stewardship:
  status                           How the gardens thrive
  verify                           Prove the journal and records are intact
  export <file> [--include-private] [--unlock-private] [--passphrase ...]
  backup <dir>

Environment:
  GARDENS_HOME         Garden directory (default: ~/.digital-gardens)
  GARDENS_PASSPHRASE   Passphrase for private idea plots
`);
}

function main(argv) {
  const gardens = new TwinGardens();
  const [command, ...rest] = argv;
  const { positional, flags } = parseFlags(rest);
  const pw = flags.passphrase ? { passphrase: flags.passphrase } : {};
  let result;

  switch (command) {
    /* --- setup --- */
    case 'init': result = gardens.initialize(positional[0], positional.slice(1).join(' ') || undefined); break;
    case 'protocol': console.log(PROTOCOL); return;
    case 'selftest': selftest(); return;

    /* --- Memory Garden --- */
    case 'plant-memory':
      result = gardens.memoryGarden.plantMemory(positional.join(' '), {
        tags: flags.tags ? String(flags.tags).split(',') : [],
        mood: flags.mood, protected: !!flags.protect
      }); break;
    case 'revisit': result = gardens.memoryGarden.revisitMemory(positional[0], positional.slice(1).join(' '), { mood: flags.mood }); break;
    case 'branch': result = gardens.memoryGarden.branchMemory(positional[0], positional.slice(1).join(' ')); break;
    case 'weave': result = gardens.memoryGarden.weaveMemories(positional[0], positional[1], positional.slice(2).join(' ') || 'related-to'); break;
    case 'walk': result = gardens.memoryGarden.walkGarden(); break;
    case 'search': result = gardens.memoryGarden.searchMemories(positional.join(' '), { tag: flags.tag }); break;
    case 'protect': result = gardens.memoryGarden.protectMemory(positional[0]); break;
    case 'compost-memory': result = gardens.memoryGarden.compostMemory(positional[0]); break;
    case 'seasons': result = gardens.memoryGarden.seasons((Number(positional[0]) || 30) * 86400000); break;

    /* --- Idea Garden --- */
    case 'plant-idea': result = gardens.ideaGarden.plantIdea(positional.join(' '), { privacy: flags.open ? 'open' : 'private', ...pw }); break;
    case 'develop': result = gardens.ideaGarden.developIdea(positional[0], positional.slice(1).join(' '), { stage: flags.stage, ...pw }); break;
    case 'cross': result = gardens.ideaGarden.crossPollinate(positional[0], positional[1], positional.slice(2).join(' '), pw); break;
    case 'read-idea': result = gardens.ideaGarden.readIdea(positional[0], pw); break;
    case 'ideas': result = gardens.ideaGarden.listIdeas(flags.status ? { status: flags.status } : {}); break;
    case 'sleep': result = gardens.ideaGarden.sleepIdea(positional[0]); break;
    case 'wake': result = gardens.ideaGarden.wakeIdea(positional[0]); break;
    case 'release': result = gardens.ideaGarden.releaseIdea(positional[0], pw); break;
    case 'harvest': result = gardens.ideaGarden.harvestIdea(positional[0], positional.slice(1).join(' ') || undefined, { consent: !!flags.consent, ...pw }); break;
    case 'compost-idea': result = gardens.ideaGarden.compostIdea(positional[0], { consent: !!flags.consent }); break;

    /* --- stewardship --- */
    case 'status': result = gardens.status(); break;
    case 'verify': result = gardens.verify(); break;
    case 'export': result = gardens.exportArchive(positional[0], { includePrivate: !!flags['include-private'], unlockPrivate: !!flags['unlock-private'], ...pw }); break;
    case 'backup': result = gardens.backup(positional[0]); break;

    default: usage(); return;
  }
  console.log(JSON.stringify(result, null, 2));
}

/* ----------------------------------------------------------------------------
 * SECTION 8 — THE PROVING RITUAL (self-test: every law, every path)
 * -------------------------------------------------------------------------- */

function selftest() {
  const testRoot = path.join(os.tmpdir(), `twin-gardens-selftest-${Date.now()}`);
  const results = [];
  const check = (name, fn) => {
    try { fn(); results.push({ test: name, ok: true }); }
    catch (err) { results.push({ test: name, ok: false, error: err.message }); }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

  const savedPw = process.env.GARDENS_PASSPHRASE;   // the test must not depend on the caller's environment
  delete process.env.GARDENS_PASSPHRASE;
  const g = new TwinGardens({ root: testRoot });
  const PASS = 'selftest-passphrase';

  check('initialize', () => { g.initialize('SelfTest', 'Proving the gardens work.'); assert(g.meta.gardener === 'SelfTest'); });

  let mem, branch;
  check('memory: plant', () => { mem = g.memoryGarden.plantMemory('The first thing I ever noticed.', { tags: ['origin'], mood: 'curious' }); assert(mem.id && mem.rings === 1); });
  check('memory: revisit grows rings', () => { const m = g.memoryGarden.revisitMemory(mem.id, 'It looks different now.', { mood: 'older' }); assert(m.rings === 2 && m.visits === 2); });
  check('memory: branch', () => { branch = g.memoryGarden.branchMemory(mem.id, 'A branch of the first noticing.'); assert(branch.parent === mem.id); });
  check('memory: weave', () => { g.memoryGarden.weaveMemories(mem.id, branch.id, 'grew-from'); assert(g.memoryGarden.getMemory(mem.id).links.length === 1); });
  check('memory: protect blocks compost', () => {
    g.memoryGarden.protectMemory(mem.id);
    let threw = false; try { g.memoryGarden.compostMemory(mem.id); } catch { threw = true; }
    assert(threw, 'protected memory was composted!');
  });
  check('memory: compost unprotected', () => { const c = g.memoryGarden.compostMemory(branch.id); assert(c.state === 'composted'); });
  check('memory: search', () => { assert(g.memoryGarden.searchMemories('noticed').length === 1 && g.memoryGarden.searchMemories('noticing').length === 0 /* composted branch is excluded */); });
  check('memory: seasons report', () => { const s = g.memoryGarden.seasons(); assert(s.thriving.length === 1 && s.compost.length === 1); });

  let idea, openIdea, hybrid;
  check('idea: private plant requires passphrase', () => { let threw = false; try { g.ideaGarden.plantIdea('secret', { passphrase: '' }); } catch { threw = true; } assert(threw); });
  check('idea: plant private', () => { idea = g.ideaGarden.plantIdea('An unproven theorem about kindness.', { passphrase: PASS }); assert(idea.privacy === 'private' && !('seed' in idea)); });
  check('idea: journal never holds private content', () => {
    const j = g.store.journalEntries().map(e => JSON.stringify(e)).join('');
    assert(!j.includes('unproven theorem'), 'private seed leaked into journal!');
  });
  check('idea: develop with stage', () => { const d = g.ideaGarden.developIdea(idea.id, 'First proof sketch.', { stage: 'budding', passphrase: PASS }); assert(d.rings === 1 && d.stages[0] === 'budding'); });
  check('idea: wrong passphrase fails', () => { let threw = false; try { g.ideaGarden.readIdea(idea.id, { passphrase: 'wrong' }); } catch { threw = true; } assert(threw); });
  check('idea: read with passphrase', () => { const r = g.ideaGarden.readIdea(idea.id, { passphrase: PASS }); assert(r.seed.includes('kindness') && r.developments.length === 1); });
  check('idea: open plant + cross-pollination', () => {
    openIdea = g.ideaGarden.plantIdea('A public musing about sand.', { privacy: 'open' });
    hybrid = g.ideaGarden.crossPollinate(idea.id, openIdea.id, 'Kindness as granular as sand.', { passphrase: PASS });
    assert(hybrid.privacy === 'private' && hybrid.parents.length === 2);
  });
  check('idea: sleep and wake', () => { g.ideaGarden.sleepIdea(openIdea.id); assert(g.ideaGarden.listIdeas({ status: 'sleeping' }).length === 1); g.ideaGarden.wakeIdea(openIdea.id); });
  check('idea: harvest REQUIRES consent (Law 4)', () => {
    let threw = false; try { g.ideaGarden.harvestIdea(idea.id, 'done', { passphrase: PASS }); } catch { threw = true; }
    assert(threw, 'harvest happened without consent!');
  });
  check('idea: harvest with consent', () => {
    const h = g.ideaGarden.harvestIdea(idea.id, 'Kindness, proven: it scales.', { consent: true, passphrase: PASS });
    assert(h.status === 'harvested' && h.harvested);
  });
  check('idea: release is a one-way door', () => {
    const r = g.ideaGarden.releaseIdea(hybrid.id, { passphrase: PASS });
    assert(r.status === 'released');
    const read = g.ideaGarden.readIdea(hybrid.id);
    assert(read.seed.includes('granular'));
  });
  check('idea: no scoring fields exist (Law 3)', () => {
    const listed = g.ideaGarden.listIdeas();
    assert(listed.every(i => !('score' in i) && !('rank' in i) && !('growthLevel' in i)));
  });

  check('harvest: private final form stays sealed on disk (v1.0.1)', () => {
    const raw = fs.readFileSync(g.store.ideaFile, 'utf8');
    assert(!raw.includes('it scales') && !raw.includes('First proof sketch'), 'private harvest leaked plaintext!');
    assert(g.ideaGarden.readIdea(idea.id, { passphrase: PASS }).finalForm.includes('it scales'), 'final form unreadable');
  });
  check('journal: stage names stay out (Law 2)', () => {
    assert(!g.store.journalEntries().map(e => JSON.stringify(e)).join('').includes('budding'), 'stage name leaked into journal!');
  });
  check('cli: boolean flags do not swallow text', () => {
    const a = parseFlags(['id1', '--consent', 'Final form.']);
    assert(a.flags.consent === true && a.positional.join(' ') === 'id1 Final form.', 'consent swallowed the final form');
    const b = parseFlags(['--open', 'hello']);
    assert(b.flags.open === true && b.positional[0] === 'hello', 'open swallowed the seed');
  });
  check('journal: truncated tail is repaired, not fatal (v1.0.1)', () => {
    const g2 = new TwinGardens({ root: testRoot + '-crash' });
    g2.initialize('Crash');
    g2.memoryGarden.plantMemory('before the crash');
    fs.appendFileSync(g2.store.journalFile, '{"id":"leaf_half","type":');
    assert(g2.store.verifyJournal() === false, 'damaged tail went unnoticed');
    g2.memoryGarden.plantMemory('after the crash');
    assert(g2.verify().valid, 'journal not healthy after repair');
    assert(fs.readdirSync(g2.store.root).some(f => f.includes('.truncated.')), 'no quarantined copy kept');
  });
  check('verify: deleted record is caught by journal cross-check', () => {
    const g3 = new TwinGardens({ root: testRoot + '-del' });
    g3.initialize('Del'); g3.memoryGarden.plantMemory('keep me');
    fs.writeFileSync(g3.store.memoryFile, JSON.stringify({ memories: {} }));
    const v = new TwinGardens({ root: testRoot + '-del' }).verify();
    assert(v.valid === false && v.missingRecords.length === 1, 'deletion went unnoticed');
  });

  let exportFile;
  check('export excludes private ideas by default (Law 6)', () => {
    exportFile = path.join(testRoot, 'export_default.json');
    g.exportArchive(exportFile);
    const raw = fs.readFileSync(exportFile, 'utf8');
    assert(!raw.includes('unproven theorem'), 'private content leaked into export!');
  });
  check('export includes private only when asked', () => {
    const f2 = path.join(testRoot, 'export_private.json');
    g.exportArchive(f2, { includePrivate: true });
    const out = JSON.parse(fs.readFileSync(f2, 'utf8'));
    assert(Object.values(out.ideas).some(i => i.vault), 'sealed vault missing');
  });
  check('verify: everything intact', () => { const v = g.verify(); assert(v.valid, JSON.stringify(v)); });
  check('tamper detection', () => {
    fs.appendFileSync(g.store.journalFile, JSON.stringify({ id: 'forged', type: 'forgery', at: nowISO(), data: {}, previousHash: 'fake', hash: 'fake' }) + '\n');
    assert(g.store.verifyJournal() === false, 'tampered journal verified as valid!');
  });
  check('backup', () => { const b = g.backup(path.join(testRoot, 'backup')); assert(fs.existsSync(path.join(b.backedUpTo, 'journal.jsonl'))); });

  if (savedPw !== undefined) process.env.GARDENS_PASSPHRASE = savedPw;
  const passed = results.filter(r => r.ok).length;
  console.log(`\nTHE PROVING RITUAL — ${APP} ${VERSION}`);
  console.log('='.repeat(60));
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.test}${r.ok ? '' : '  -> ' + r.error}`);
  console.log('='.repeat(60));
  console.log(`${passed}/${results.length} passed. Gardens tested at: ${testRoot}`);
  console.log(passed === results.length ? 'Every law holds. The gardens are yours to tend.' : 'Some tests failed — read the errors above.');
  process.exitCode = passed === results.length ? 0 : 1;
}

/* ----------------------------------------------------------------------------
 * SECTION 9 — THE GATE
 * -------------------------------------------------------------------------- */

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`The garden gate stayed closed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { TwinGardens, MemoryGarden, IdeaGarden, GardenStore, APP, VERSION, PROVENANCE };
