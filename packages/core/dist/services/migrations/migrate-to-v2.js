/**
 * Phase 10a v2 migration engine (Step 4 — core).
 *
 * Pure module. Given a list of v1-shape `Commitment` rows + a person
 * directory + the workspace owner's slug + a sidecar of user
 * disambiguations, this module produces:
 *
 *   - the migrated v2-shape `Commitment[]` (canonical-per-group),
 *   - a categorized `MigrationDiff` for the audit artifact,
 *   - an array of `AmbiguousRow` entries the user must disambiguate.
 *
 * The CLI verb (`packages/cli/src/commands/commitments.ts`) wires this
 * to the storage adapter + emits `migration-diff.md`. Tests exercise
 * the engine via synthetic fixtures — NO production data writes happen
 * at any layer in this build (per phase-10a constraints).
 *
 * Algorithm (per plan §"Migration plan (v2)" + AC1a-h):
 *
 *   1. For each row: run `extractCounterpartiesFromText` to derive
 *      v2 stakeholders + (possibly rewritten) direction. Stash
 *      ambiguous rows in a parallel list with their candidate names.
 *
 *   2. For each row that is NOT ambiguous: compute the v2 hash via
 *      `computeCommitmentHashV2(text, direction)`. Group by hash.
 *
 *   3. Within each group, sort by `date` ascending (oldest = canonical
 *      per PM Q5). Tiebreak on `createdAt`, then on row's original
 *      index (insertion order). Build the canonical v2 row by:
 *        - unioning `stakeholders[]` (de-duped by slug; mentioned <
 *          recipient < sender < self for role priority — see
 *          `mergeStakeholderRoles`)
 *        - unioning `source_meetings[]` (de-duped; canonical's
 *          `source` first)
 *        - merging `textVariants[]` (canonical text first; cap at 5,
 *          drop oldest when over)
 *        - resolving status conflicts (any resolved → resolved,
 *          earliest `resolvedAt`; any deferred w/o resolved → open
 *          (we re-open); else preserve canonical)
 *        - preserving `area` from the canonical row's `area` if any;
 *          else from the first group entry that carries one
 *        - emitting `source_external: []` (Phase 11)
 *
 *   4. Categorize each group for the diff report:
 *        - 'pass-through': single-row group, no v1→v2 changes other
 *          than added v2 fields (stakeholders inferred, etc.)
 *        - 'collapsed':    multi-row group; multiple v1 rows fold
 *          into one v2 row.
 *        - 'self-rewrite': single-row group where direction shifted
 *          to 'self' via owner-as-personSlug repair.
 *        - 'status-conflict': multi-row group with mixed status (e.g.,
 *          one resolved + one open).
 *        - 'ambiguous': row(s) whose counterparty parse was ambiguous;
 *          NOT folded into any group; surfaced separately.
 *
 *   5. Apply a sidecar `Disambiguations` map (name → chosen slug) to
 *      ambiguous rows before grouping. Without disambiguation, the
 *      row stays in the ambiguous bucket and `--apply` (CLI layer)
 *      blocks until the user resolves.
 *
 * NO LLM CALLS in this module. Semantic dedup is Phase 10b — this
 * module only does deterministic hash-bucket grouping.
 */
import { COMMITMENT_TEXT_VARIANTS_MAX } from '../../models/index.js';
import { computeCommitmentHashV2 } from '../commitments-hash-v2.js';
import { extractCounterpartiesFromText, } from '../commitments-counterparty-parser.js';
// ---------------------------------------------------------------------------
// Stakeholder role priority (for union merge)
// ---------------------------------------------------------------------------
/**
 * Role priority for merging duplicates across rows in the same group.
 *
 * When the same slug appears with different roles, the HIGHER-priority
 * role wins. Order: recipient/sender > mentioned > self.
 *
 * Rationale: recipient/sender carries action semantics; mentioned is
 * context-only; self is the owner-fallback. Promoting to the most
 * specific role preserves the most information.
 */
const ROLE_PRIORITY = {
    recipient: 3,
    sender: 3,
    mentioned: 2,
    self: 1,
};
function mergeStakeholderRoles(existing, incoming) {
    if (ROLE_PRIORITY[incoming.role] > ROLE_PRIORITY[existing.role]) {
        return { ...existing, role: incoming.role };
    }
    return existing;
}
function unionStakeholders(lists) {
    const bySlug = new Map();
    for (const list of lists) {
        for (const s of list) {
            const existing = bySlug.get(s.slug);
            if (!existing) {
                bySlug.set(s.slug, { ...s });
            }
            else {
                bySlug.set(s.slug, mergeStakeholderRoles(existing, s));
            }
        }
    }
    return [...bySlug.values()];
}
function parseRow(c, index, inputs) {
    // Idempotency: a row that ALREADY carries v2 `stakeholders[]` is
    // authoritative — we trust prior migration output and skip parsing.
    // This makes `migrate(migrate(x)) === migrate(x)` (no ambiguity
    // re-introduction from re-parsing text).
    if (c.stakeholders && c.stakeholders.length > 0) {
        const hash = computeCommitmentHashV2(c.text, c.direction);
        return {
            source: c,
            index,
            direction: c.direction,
            stakeholders: [...c.stakeholders],
            hash,
            ambiguous: false,
            selfRewritten: false,
        };
    }
    // Direction widening: pre-Phase-10 entries only ever carry
    // 'i_owe_them' | 'they_owe_me'. We feed those to the parser as-is.
    const parsed = extractCounterpartiesFromText(c.text, inputs.ownerSlug, c.direction, inputs.directory);
    // Sidecar disambiguation: when the parser flagged ambiguous names,
    // try to resolve them from the user-supplied sidecar BEFORE bucketing.
    let ambiguousNames = parsed.ambiguousNames;
    let stakeholders = parsed.stakeholders;
    let ambiguous = parsed.ambiguous;
    let direction = parsed.direction;
    if (ambiguous && ambiguousNames && inputs.disambiguations) {
        const resolved = [];
        const stillAmbiguous = [];
        for (const an of ambiguousNames) {
            const key = `${c.id}::${an.name.toLowerCase()}`;
            const chosen = inputs.disambiguations.get(key);
            if (chosen && an.candidates.includes(chosen)) {
                const role = direction === 'they_owe_me' ? 'sender' : 'recipient';
                resolved.push({ slug: chosen, role });
            }
            else {
                stillAmbiguous.push(an);
            }
        }
        if (stillAmbiguous.length === 0) {
            // All ambiguities resolved via sidecar.
            ambiguous = false;
            ambiguousNames = undefined;
            stakeholders = resolved;
        }
        else {
            // Partial resolution — still ambiguous overall.
            ambiguousNames = stillAmbiguous;
        }
    }
    const selfRewritten = direction === 'self' &&
        c.direction !== 'self' &&
        c.direction !== 'self';
    const hash = ambiguous ? '' : computeCommitmentHashV2(c.text, direction);
    return {
        source: c,
        index,
        direction,
        stakeholders,
        hash,
        ambiguous,
        ambiguousNames,
        selfRewritten,
    };
}
// ---------------------------------------------------------------------------
// Status conflict resolution
// ---------------------------------------------------------------------------
/**
 * Group status resolution per plan §"Migration plan (v2)" step 4:
 *   - any 'resolved' → group is 'resolved'; use earliest `resolvedAt`.
 *   - any 'deferred' without a 'resolved' → group is 'open' (un-defer).
 *     (Note: the v1 type is `'open' | 'resolved' | 'dropped'`; we treat
 *     'dropped' as a terminal state distinct from 'resolved' — same
 *     handling rule: dropped wins over open, earliest resolvedAt.)
 *   - else preserve canonical's status.
 */
function resolveGroupStatus(group) {
    let conflicted = false;
    const statuses = new Set(group.map((c) => c.status));
    if (statuses.size > 1)
        conflicted = true;
    // Prefer terminal states; pick earliest resolvedAt among those.
    const terminal = group.filter((c) => c.status === 'resolved' || c.status === 'dropped');
    if (terminal.length > 0) {
        // Earliest resolvedAt (non-null)
        const candidates = terminal
            .filter((c) => c.resolvedAt !== null)
            .map((c) => c.resolvedAt)
            .sort();
        const earliest = candidates[0] ?? null;
        // If multiple terminal statuses (resolved + dropped), 'resolved'
        // wins as it's the more specific completion signal.
        const status = terminal.some((c) => c.status === 'resolved')
            ? 'resolved'
            : 'dropped';
        return { status, resolvedAt: earliest, conflicted };
    }
    // No terminal statuses → all open. Canonical's status (always 'open') wins.
    return { status: 'open', resolvedAt: null, conflicted };
}
// ---------------------------------------------------------------------------
// Build canonical v2 row from a group
// ---------------------------------------------------------------------------
function buildCanonicalV2(group) {
    // Sort group by date asc, then createdAt asc, then original index.
    // Comparable as ISO strings.
    const sorted = [...group].sort((a, b) => {
        const da = a.source.date;
        const db = b.source.date;
        if (da < db)
            return -1;
        if (da > db)
            return 1;
        const ca = a.source.createdAt ?? '';
        const cb = b.source.createdAt ?? '';
        if (ca < cb)
            return -1;
        if (ca > cb)
            return 1;
        return a.index - b.index;
    });
    const canonicalRow = sorted[0];
    const c = canonicalRow.source;
    // Stakeholders: union across all rows in the group.
    const stakeholders = unionStakeholders(sorted.map((r) => r.stakeholders));
    // source_meetings: canonical's `source` first, then any others.
    const sourceMeetings = [];
    const seenSource = new Set();
    for (const r of sorted) {
        const src = r.source.source;
        if (src && !seenSource.has(src)) {
            seenSource.add(src);
            sourceMeetings.push(src);
        }
    }
    // textVariants: canonical text first; distinct variants; cap at MAX.
    const textVariants = [];
    const seenText = new Set();
    for (const r of sorted) {
        const t = r.source.text;
        if (!t || seenText.has(t))
            continue;
        seenText.add(t);
        textVariants.push(t);
        if (textVariants.length >= COMMITMENT_TEXT_VARIANTS_MAX)
            break;
    }
    // Status resolution.
    const { status, resolvedAt, conflicted } = resolveGroupStatus(sorted.map((r) => r.source));
    // Area: prefer canonical's; else first non-null in group.
    let area = c.area;
    if (area === undefined) {
        for (const r of sorted) {
            if (r.source.area !== undefined) {
                area = r.source.area;
                break;
            }
        }
    }
    // Direction: canonical's parsed direction.
    const direction = canonicalRow.direction;
    const canonical = {
        id: c.id,
        text: c.text,
        direction,
        personSlug: c.personSlug, // v1 field RETAINED — dual-shape window
        personName: c.personName, // v1 field RETAINED
        source: c.source, // v1 field RETAINED (the canonical's source)
        date: c.date,
        createdAt: c.createdAt,
        status,
        resolvedAt,
        ...(c.projectSlug !== undefined ? { projectSlug: c.projectSlug } : {}),
        ...(c.goalSlug !== undefined ? { goalSlug: c.goalSlug } : {}),
        ...(area !== undefined ? { area } : {}),
        ...(c.areaSetBy !== undefined ? { areaSetBy: c.areaSetBy } : {}),
        stakeholders,
        source_meetings: sourceMeetings,
        source_external: [], // Phase 11 reserved
        textVariants,
    };
    return { canonical, conflicted };
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Run the migration in-memory.
 *
 * Idempotency: running on the OUTPUT of a previous run is a fixed point
 * — every row already has `stakeholders[]`, hashes already collapse,
 * and the diff reports zero collapsed/self-rewrite/ambiguous rows.
 */
export function migrateCommitmentsToV2(inputs) {
    const parsed = inputs.commitments.map((c, idx) => parseRow(c, idx, inputs));
    // Split ambiguous rows out — they don't bucket.
    const ambiguousRows = parsed.filter((r) => r.ambiguous);
    const resolvable = parsed.filter((r) => !r.ambiguous);
    // Bucket by hash.
    const buckets = new Map();
    for (const r of resolvable) {
        const bucket = buckets.get(r.hash);
        if (bucket)
            bucket.push(r);
        else
            buckets.set(r.hash, [r]);
    }
    const migrated = [];
    const diff = [];
    // Preserve canonical-order: iterate buckets in the order their
    // canonical (oldest) row appears in the original input. This keeps
    // the diff readable.
    const bucketEntries = [...buckets.entries()].sort((a, b) => {
        const minA = Math.min(...a[1].map((r) => r.index));
        const minB = Math.min(...b[1].map((r) => r.index));
        return minA - minB;
    });
    for (const [hash, group] of bucketEntries) {
        const { canonical, conflicted } = buildCanonicalV2(group);
        migrated.push(canonical);
        const notes = [];
        let category;
        if (group.length > 1 && conflicted) {
            category = 'status-conflict';
            notes.push(`Mixed status across ${group.length} rows: ${[...new Set(group.map((r) => r.source.status))].join(', ')}; resolved to '${canonical.status}'`);
        }
        else if (group.length > 1) {
            category = 'collapsed';
            notes.push(`${group.length} rows folded into one canonical`);
        }
        else if (group[0].selfRewritten) {
            category = 'self-rewrite';
            notes.push(`direction rewritten from '${group[0].source.direction}' to 'self' (no resolvable counterparty in text)`);
        }
        else {
            category = 'pass-through';
        }
        // Note the text-variants cap if we'd otherwise overflow
        const distinctVariants = new Set(group.map((r) => r.source.text)).size;
        if (distinctVariants > COMMITMENT_TEXT_VARIANTS_MAX) {
            notes.push(`${distinctVariants} distinct text variants → capped at ${COMMITMENT_TEXT_VARIANTS_MAX} (oldest-first drop)`);
        }
        diff.push({
            category,
            hash,
            before: group.map((r) => r.source),
            after: canonical,
            notes,
        });
    }
    // Ambiguous rows — surfaced separately, NOT migrated.
    for (const r of ambiguousRows) {
        diff.push({
            category: 'ambiguous',
            hash: '',
            before: [r.source],
            after: null,
            ambiguous: r.ambiguousNames,
            notes: [
                `bare-name ambiguity blocks migration; user must disambiguate via sidecar (.arete/commitments.pre-phase-10-ambiguities.json)`,
            ],
        });
    }
    // Counts
    const summary = {
        totalIn: inputs.commitments.length,
        totalOut: migrated.length,
        passThrough: 0,
        collapsed: 0,
        selfRewrite: 0,
        statusConflict: 0,
        ambiguous: 0,
    };
    for (const row of diff) {
        switch (row.category) {
            case 'pass-through':
                summary.passThrough += 1;
                break;
            case 'collapsed':
                summary.collapsed += 1;
                break;
            case 'self-rewrite':
                summary.selfRewrite += 1;
                break;
            case 'status-conflict':
                summary.statusConflict += 1;
                break;
            case 'ambiguous':
                summary.ambiguous += 1;
                break;
        }
    }
    return { migrated, diff, summary };
}
// ---------------------------------------------------------------------------
// Diff report writer (markdown)
// ---------------------------------------------------------------------------
/**
 * Build the `migration-diff.md` content. Categorizes by row source per
 * AC1g (delta-diff legibility) AND per AC1h (24h quiet-window guard
 * surfaces the same row breakdown).
 *
 * Format is deliberately simple — pure markdown so the user can read
 * it in any editor and grep for hashes. NO json. NO yaml frontmatter.
 */
export function formatMigrationDiff(result, meta) {
    const { summary, diff } = result;
    const lines = [];
    lines.push(`# Phase 10a migration diff — ${meta.mode}`);
    lines.push('');
    lines.push(`**Workspace**: \`${meta.workspaceRoot}\``);
    lines.push(`**Owner slug**: \`${meta.ownerSlug}\``);
    lines.push(`**Generated**: ${meta.timestamp}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Total input rows: ${summary.totalIn}`);
    lines.push(`- Total output rows: ${summary.totalOut}`);
    lines.push(`- Pass-through:    ${summary.passThrough}`);
    lines.push(`- Collapsed:       ${summary.collapsed}`);
    lines.push(`- Self-rewrite:    ${summary.selfRewrite}`);
    lines.push(`- Status conflict: ${summary.statusConflict}`);
    lines.push(`- **Ambiguous (BLOCKS APPLY)**: ${summary.ambiguous}`);
    lines.push('');
    if (meta.deltaSources) {
        lines.push('## Delta-source breakdown (AC1g)');
        lines.push('');
        lines.push(`- new-extract:    ${meta.deltaSources.newExtract}`);
        lines.push(`- manual-resolve: ${meta.deltaSources.manualResolve}`);
        lines.push(`- manual-drop:    ${meta.deltaSources.manualDrop}`);
        lines.push(`- manual-create:  ${meta.deltaSources.manualCreate}`);
        lines.push('');
    }
    // Section: ambiguous (always first — blocks --apply)
    const ambig = diff.filter((d) => d.category === 'ambiguous');
    if (ambig.length > 0) {
        lines.push('## Ambiguous (user must disambiguate)');
        lines.push('');
        lines.push('Edit `.arete/commitments.pre-phase-10-ambiguities.json` to specify the chosen slug for each entry below, then re-run `--dry-run` to verify.');
        lines.push('');
        for (const row of ambig) {
            const c = row.before[0];
            lines.push(`### \`${c.id.slice(0, 8)}\` — \`${c.source}\``);
            lines.push('');
            lines.push(`- Text: ${quoteText(c.text)}`);
            lines.push(`- Direction: ${c.direction}`);
            lines.push(`- v1 personSlug: \`${c.personSlug}\``);
            if (row.ambiguous) {
                for (const an of row.ambiguous) {
                    lines.push(`- Name "${an.name}" matches: ${an.candidates.map((s) => `\`${s}\``).join(', ')}`);
                }
            }
            lines.push('');
        }
    }
    // Sections by category
    const sectionOrder = [
        'collapsed',
        'status-conflict',
        'self-rewrite',
        'pass-through',
    ];
    for (const cat of sectionOrder) {
        const rows = diff.filter((d) => d.category === cat);
        if (rows.length === 0)
            continue;
        lines.push(`## ${humanCategory(cat)} (${rows.length})`);
        lines.push('');
        // Pass-through is the majority — surface compactly.
        if (cat === 'pass-through') {
            for (const row of rows) {
                const c = row.before[0];
                lines.push(`- \`${c.id.slice(0, 8)}\` \`${shortHash(row.hash)}\` ${quoteText(c.text)}`);
            }
            lines.push('');
            continue;
        }
        for (const row of rows) {
            const c = row.before[0];
            lines.push(`### \`${shortHash(row.hash)}\` — ${quoteText(c.text)}`);
            lines.push('');
            lines.push(`- BEFORE (${row.before.length} row${row.before.length === 1 ? '' : 's'}):`);
            for (const b of row.before) {
                lines.push(`  - \`${b.id.slice(0, 8)}\` ${b.source} ${b.date} ${b.status} dir=${b.direction} personSlug=${b.personSlug}`);
            }
            if (row.after) {
                lines.push(`- AFTER:`);
                lines.push(`  - \`${row.after.id.slice(0, 8)}\` dir=${row.after.direction} status=${row.after.status}`);
                lines.push(`  - stakeholders: ${row.after.stakeholders?.map((s) => `${s.slug}/${s.role}`).join(', ') ?? '(none)'}`);
                lines.push(`  - source_meetings: ${row.after.source_meetings?.join(', ') ?? '(none)'}`);
                lines.push(`  - textVariants (${row.after.textVariants?.length ?? 0}): ${row.after.textVariants?.map(quoteText).join(' / ') ?? '(none)'}`);
            }
            for (const note of row.notes) {
                lines.push(`- NOTE: ${note}`);
            }
            lines.push('');
        }
    }
    return lines.join('\n');
}
function humanCategory(c) {
    switch (c) {
        case 'collapsed':
            return 'Collapsed (multi-row groups folded into one canonical)';
        case 'status-conflict':
            return 'Status conflict (mixed status across rows)';
        case 'self-rewrite':
            return 'Self-rewrite (direction shifted to self via owner-as-personSlug repair)';
        case 'pass-through':
            return 'Pass-through (single-row, v2 fields added)';
        case 'ambiguous':
            return 'Ambiguous';
    }
}
function shortHash(h) {
    if (!h)
        return '________';
    return h.slice(0, 8);
}
function quoteText(t) {
    // Escape backticks; truncate at 120 chars for readability.
    const cleaned = t.replace(/`/g, "'").replace(/\n/g, ' ');
    const truncated = cleaned.length > 120 ? cleaned.slice(0, 117) + '...' : cleaned;
    return `"${truncated}"`;
}
//# sourceMappingURL=migrate-to-v2.js.map