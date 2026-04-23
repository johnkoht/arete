# Pre-Mortem: topic-wiki-memory

**Date**: 2026-04-22
**Plan**: `dev/work/plans/topic-wiki-memory/plan.md` (v3, post-two-round review)
**Scope**: Shipping Steps 1–10 autonomously overnight.

Imagine it's 2026-04-29. The builder shipped. Users on `arete-reserv` are filing issues. This pre-mortem identifies the failure modes most likely to have caused that.

## Risk table (sorted by severity × likelihood)

| # | Risk | Severity | Likelihood | Covered? |
|---|------|----------|------------|----------|
| 1 | `FileStorageAdapter.write` is **not atomic** — direct `fs.writeFile`, no tmp+rename. CLAUDE.md truncation mid-write strands agents on partial content. | **CRITICAL** | MEDIUM | Plan §9.6 + §9.7 *assume* atomicity and even test for it, but implementation at `packages/core/src/storage/file.ts:20-24` doesn't provide it. Builder must change `FileStorageAdapter.write` or the test will fail and CLAUDE.md corruption ships. |
| 2 | **Seed cost blow-up past $9 estimate.** Estimate assumes ~3 topics/meeting × 200 meetings. Extraction prompt allows up to 6; pre-Step-2 meetings have stubs from the alias-miss new-topic branch; each stub re-runs `integrateSource` on every source that mentions it. Realistic worst case: 200 × 6 × $0.03 × 2 retries = **~$72**. | **CRITICAL** | MEDIUM | Step 8 AC mandates `--dry-run` + `--confirm`, but the dry-run estimator uses the same ~3×$0.015 assumption. Must: count `intelligence.topics[]` per-meeting before estimating; hard-cap retries; abort seed if mid-run spend crosses 2× estimate. |
| 3 | **Race: `meeting apply` mid-flight while `memory refresh` runs.** Step 3 writes topic pages at `commitApprovedItems` (cli/meeting.ts:1304). `memory refresh` reads-all then overwrites. No lock. Last-writer-wins can erase a just-integrated source. | **CRITICAL** | MEDIUM | §9.6 documents this for CLAUDE.md only ("optional `.arete/.refresh.lock`… deferred") and doesn't address topic-page bodies. Add an advisory lock covering `.arete/memory/topics/**` during both paths. |
| 4 | **LLM output silently passes Zod schema then corrupts a topic page.** Step 3 §3 specifies `updated_sections: Partial<Record<SectionName, string>>`. Zod accepts any string, including the LLM parroting an entire prior page into one section, or returning a section keyed with a typo. | **HIGH** | HIGH | Step 3 AC says "malformed → fallback," but Zod on `Record<string,string>` is too permissive. Add: (a) enum-keyed union instead of `Partial<Record>`, (b) per-section max-length + min-length guards, (c) reject if `new_change_log_entry` omitted, (d) sanity check that no section body contains raw `---`. |
| 5 | **CLAUDE.md git-diff churn despite idempotency claim.** §9.5 hinges on byte-equal compare. YAML libs vary on key order. One meeting apply → different topic `last_refreshed` → CLAUDE.md header date changes → diff. Weekly 200-topic noise. | **HIGH** | HIGH | §9.5 names instability sources but no test pins YAML stringify determinism. Builder must: freeze key order in `renderTopicPage`, write a round-trip test under shuffled input, specifically test that applying one meeting that touches 1 topic produces a CLAUDE.md diff of ≤1 line, not N. |
| 6 | **Topic sprawl despite the alias pass.** Jaccard 0.4–0.6 band is the adjudication zone, but slugs like `leap-templates` vs `leap-email-templates` score 0.67 on word-token Jaccard → auto-coerce to wrong existing slug. Asymmetric failure mode. | **HIGH** | MEDIUM | Step 2 §3 sets 0.6 threshold without tuning data. Before seed, run the alias pass in `--dry-run` over arete-reserv and eyeball the auto-coerce list. Drop threshold to 0.5 and widen the LLM band to 0.3–0.7 for seed, then tighten. |
| 7 | **`arete update` regression despite §9.4 fix.** If `loadMemorySummary` throws synchronously during module import resolution, the `.catch()` doesn't fire. User runs `npm update -g arete` Wednesday, CLAUDE.md Active Topics silently vanishes. | **HIGH** | LOW | §9.4 describes the contract. Test row "arete update preserves topics" exists in §9.7 but tests the happy path. Add a test that injects `loadMemorySummary` throwing synchronously. |
| 8 | **Search index drift between qmd and topic files.** Step 3 cites `meeting.ts:958` but `commitApprovedItems` at `meeting.ts:1304` is a different code path. Grep shows 5 `refreshQmdIndex` call sites (lines 234, 415, 958, 1390, 1685). | **HIGH** | MEDIUM | Builder must identify every `refreshQmdIndex` call site and prove topic writes precede each. |
| 9 | **`callLLM` absent at exactly the wrong moment (rate limit mid-loop).** Partial integration leaves some `sources_integrated` entries written, others not. Subsequent re-runs are NOT no-ops. | **HIGH** | MEDIUM | Wrap each `integrateSource` in try/catch; on failure, write a fallback Source-trail-only entry AND mark `sources_integrated` with `{status: 'partial', error}` so next refresh retries. |
| 10 | **`log.md` grammar broken by LLM error strings containing `\|` or newlines.** Grep-based replay breaks for all subsequent lines. | **HIGH** | MEDIUM | URL-encode or quote-escape all k=v values before write; reject writes with unescaped `\|`; CI schema test must include adversarial payloads. |
| 11 | **Topic page parser drops user-authored content.** A user who opens a topic page in Obsidian and edits anything loses work on next `integrateSource`. | **HIGH** | MEDIUM | First-run UX: (a) write a banner comment at top `<!-- SYSTEM-OWNED — edits will be overwritten -->`, (b) `arete topic lint` detect mtime newer than `last_refreshed` and warn. |
| 12 | **`meeting apply --skip-topics` not wired through every path.** Hook 1 and Hook 2 live in different files. | MEDIUM | MEDIUM | Add a single option object threaded through both hooks. Test: `--skip-topics` on meeting with extracted topics produces zero topic-page writes AND zero frontmatter slug normalization. |
| 13 | **Stale-threshold clock skew.** CI / container clocks with drift will flap topics between stale and fresh. | MEDIUM | LOW | Compare dates at day granularity; clamp negative skew to 0 days old. |
| 14 | **Index.md regeneration on stale topic list.** Partial-state errors silently dropped — index silently loses broken topic. | MEDIUM | MEDIUM | Index.md generation should surface error count at the bottom. |
| 15 | **Concurrent seed + meeting-apply.** Same race as #3 but under cost pressure. | MEDIUM | LOW | Seed command should take a workspace-wide lock at `.arete/.seed.lock`. |

---

## CRITICAL risks — must address before code ships

### 1. `FileStorageAdapter.write` is not atomic
`packages/core/src/storage/file.ts:20-24` is a plain `fs.writeFile`. Step 9.6 claims atomicity as a "contract requirement" and 9.7 includes a test for it. The test will fail unless the implementation changes.
**Action**: implement `write` as `writeFile(path+'.tmp') + rename(path+'.tmp', path)`. Cross-cutting fix, benefits every file write.

### 2. Seed cost 10x blow-up
The $9 estimate is a point estimate. Real arete-reserv meetings extract up to 6 topics, many near-duplicates, and retry-on-malformed-LLM doubles calls.
**Action**: dry-run MUST enumerate actual `intelligence.topics[]` counts from each meeting's frontmatter before estimating. Add mid-seed cost ceiling (`ARETE_SEED_MAX_USD`, default $20) that aborts if exceeded, printing resume command.

### 3. Race between apply / refresh / update on topic pages and CLAUDE.md
`commitApprovedItems`, `memory refresh`, `arete update` can all rewrite the same file milliseconds apart. Topic-page body corruption is silent — LLMs happily absorb partial pages as context.
**Action**: ship `.arete/.memory.lock` advisory file-lock in Phase 1, not deferred. Scope: any write under `.arete/memory/topics/**` or to `CLAUDE.md`.

---

## Mitigations folded into plan (done during overnight build)

- **Risk 1 (atomic write)**: `FileStorageAdapter.write` fixed as a prerequisite commit before Step 9; test added to `packages/core/test/storage/file.test.ts`.
- **Risk 2 (seed cost)**: Step 8 updated — estimator reads `intelligence.topics[]` per meeting; `ARETE_SEED_MAX_USD` ceiling; resume doc.
- **Risk 3 (race)**: advisory lock at `.arete/.memory.lock` added to Phase 1 (was: deferred).
- Other HIGH risks (#4, #5, #8) — addressed in relevant step ACs during implementation.
