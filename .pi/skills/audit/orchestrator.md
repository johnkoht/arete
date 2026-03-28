# Audit Skill — Orchestrator

Instructions for orchestrating domain expert dispatch, report aggregation, and approval gates.

---

## Phase 1: Parse Flags

```typescript
const scope = flags['--scope'] || 'all';  // 'core' | 'cli' | 'runtime' | 'build' | 'docs' | 'all'
const dryRun = flags['--dry-run'] || false;
const date = new Date().toISOString().split('T')[0];

// Validate scope
const validScopes = ['core', 'cli', 'runtime', 'build', 'docs', 'all'];
if (!validScopes.includes(scope)) {
  error(`Invalid scope: ${scope}. Valid: ${validScopes.join(', ')}`);
}

// Create output directory
fs.mkdirSync(`dev/work/audits/${date}`, { recursive: true });
```

---

## Phase 2: Load Manifest

```typescript
const manifest = yaml.parse(fs.readFileSync('.pi/skills/audit/manifest.yaml', 'utf-8'));
const domains = scope === 'all' ? Object.keys(manifest.domains) : [scope];
```

---

## Phase 3: Dispatch Domain Experts

For each domain, spawn a `developer` agent. The subagent reads their own expertise profile.

### Domain Configuration

| Domain | Expertise Profile | Key Files to Audit |
|--------|-------------------|-------------------|
| core | `.pi/expertise/core/PROFILE.md` | packages/core/src/, capabilities.json |
| cli | `.pi/expertise/cli/PROFILE.md` | packages/cli/, capabilities.json |
| runtime | `.pi/expertise/core/PROFILE.md` | packages/runtime/, GUIDE.md |
| build | (none) | .pi/, memory/ |
| docs | (none) | README.md, SETUP.md, DEVELOPER.md |

### Subagent Prompt Template

```typescript
for (const domain of domains) {
  const config = manifest.domains[domain];
  
  subagent({
    agent: "developer",
    agentScope: "project",
    task: `## Domain Audit: ${domain}

${config.expertise_profile ? `**Read first**: ${config.expertise_profile} — internalize the architecture before auditing.` : ''}

### Your Scope
${config.files.map(f => `- ${f}`).join('\n')}

### What to Check
1. **LEARNINGS.md coverage**: Do significant directories have LEARNINGS.md?
2. **Accuracy**: Do docs/configs match actual codebase?
3. **Completeness**: Are there obvious gaps?

### Auto-Fix Allowed
${config.auto_fix.map(f => `- ${f}`).join('\n')}

### Requires Approval (report only)
${config.require_approval.map(f => `- ${f}`).join('\n')}

### Output
Write findings to \`dev/work/audits/${date}/expert-${domain}.md\` using this format:

\`\`\`markdown
# Audit: ${domain}

## Findings
- [✅|⚠️|❌] {file/component}: {description}

## Auto-Fixed
- {file}: {what changed}
${dryRun ? '(DRY-RUN: No changes applied)' : ''}

## Proposed Changes (require approval)

### capabilities.json additions
\\\`\\\`\\\`json
{ "id": "...", "type": "...", ... }
\\\`\\\`\\\`

### Other changes
- File: {path}
- Change: {description}
\`\`\`

### Rules
- ${dryRun ? '**DRY-RUN MODE**: Report only, do NOT modify any files.' : 'You may auto-fix items in the "Auto-Fix Allowed" list.'}
- Do NOT edit capabilities.json directly — report proposals for orchestrator to merge.
- Verify files are in YOUR domain before auto-fixing.
`
  });
}
```

---

## Phase 4: Collect Reports

```typescript
const reports = {};
for (const domain of domains) {
  const reportPath = `dev/work/audits/${date}/expert-${domain}.md`;
  if (fs.existsSync(reportPath)) {
    reports[domain] = fs.readFileSync(reportPath, 'utf-8');
  } else {
    console.warn(`⚠️ Missing report for ${domain}`);
  }
}
```

---

## Phase 5: Cross-Cutting Checks (Orchestrator-Owned)

These span domains, so the orchestrator handles them directly:

1. **AGENTS.md [Skills] section** — matches `packages/runtime/skills/`?
2. **memory/MEMORY.md index** — references valid entries?
3. **capabilities.json paths** — all `implementationPaths` exist?

---

## Phase 6: Extract Structural Changes

Parse reports for items requiring approval:

```typescript
const approvalItems = [];

for (const [domain, report] of Object.entries(reports)) {
  // Extract capabilities.json proposals
  const capsMatch = report.match(/### capabilities\.json additions\n```json\n([\s\S]*?)```/);
  if (capsMatch) {
    approvalItems.push({ domain, type: 'capabilities.json', payload: JSON.parse(capsMatch[1]) });
  }
  
  // Extract other proposed changes
  const otherMatch = report.match(/### Other changes\n([\s\S]*?)(?=\n#|$)/);
  if (otherMatch) {
    approvalItems.push({ domain, type: 'other', description: otherMatch[1].trim() });
  }
}
```

---

## Phase 7: Approval Gate

If not dry-run and there are items requiring approval:

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Proposed Changes                                            │
├─────────────────────────────────────────────────────────────────┤
│  1. [core] capabilities.json: Add 'conversations' integration   │
│  2. [cli] capabilities.json: Add 'template' commands            │
│  3. [build] .pi/expertise/core/PROFILE.md: Update invariants    │
├─────────────────────────────────────────────────────────────────┤
│  [Y] Apply all  [N] Skip all  [1,2,...] Select items           │
└─────────────────────────────────────────────────────────────────┘
```

- **Y**: Apply all approved items
- **N**: Skip all, save to `dev/work/audits/${date}-deferred.md`
- **1,2,3**: Apply selected items, defer rest

---

## Phase 8: Apply Approved Changes

### Capabilities.json (Single-Point Edit)

Orchestrator merges ALL capabilities.json proposals:

```typescript
if (capsApproved.length > 0) {
  const caps = JSON.parse(fs.readFileSync('dev/catalog/capabilities.json', 'utf-8'));
  
  for (const item of capsApproved) {
    if (!caps.capabilities.some(c => c.id === item.payload.id)) {
      caps.capabilities.push(item.payload);
    }
  }
  
  caps.lastUpdated = date;
  fs.writeFileSync('dev/catalog/capabilities.json', JSON.stringify(caps, null, 2));
}
```

### Deferred Items

```typescript
if (skipped.length > 0) {
  const content = `# Deferred Audit Items — ${date}\n\n` +
    skipped.map((item, i) => `${i + 1}. **${item.type}** (${item.domain}): ${item.description || 'See details'}`).join('\n');
  fs.writeFileSync(`dev/work/audits/${date}-deferred.md`, content);
}
```

---

## Phase 9: Generate Final Report

Use `templates/audit-report.md` to generate the report. The template uses Handlebars-like syntax:
- `{{variable}}` — Simple variable replacement
- `{{#if condition}}...{{/if}}` — Conditional sections

```typescript
const reportPath = `dev/work/audits/${date}.md`;
const report = renderTemplate('templates/audit-report.md', {
  date,
  mode: dryRun ? 'dry-run' : (scope === 'all' ? 'full' : `scope: ${scope}`),
  domains: Object.keys(reports),
  findings: aggregateFindings(reports),
  approved,
  skipped
});
fs.writeFileSync(reportPath, report);
```

---

## Error Handling

| Error | Recovery |
|-------|----------|
| Expert fails to produce report | Log warning, continue with other domains |
| Invalid report format | Include raw report in final output |
| capabilities.json parse error | Skip capabilities changes, flag in report |

---

## References

- **SKILL.md**: Triggers, flags, workflow overview
- **manifest.yaml**: Domain configurations
- **templates/audit-report.md**: Report template
