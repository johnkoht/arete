# Audit Skill — Orchestrator

Detailed instructions for orchestrating domain expert dispatch, report aggregation, and approval gates.

---

## Phase 1: Parse Flags

```typescript
// Parse command line
const scope = flags['--scope'] || 'all';  // 'core' | 'cli' | 'runtime' | 'build' | 'docs' | 'all'
const dryRun = flags['--dry-run'] || false;

// Validate scope
const validScopes = ['core', 'cli', 'runtime', 'build', 'docs', 'all'];
if (!validScopes.includes(scope)) {
  error(`Invalid scope: ${scope}. Valid: ${validScopes.join(', ')}`);
}
```

---

## Phase 2: Load Manifest

Read `manifest.yaml` to get domain configurations:

```typescript
const manifest = yaml.parse(fs.readFileSync('.pi/skills/audit/manifest.yaml', 'utf-8'));

// Get domains to audit
const domains = scope === 'all' 
  ? Object.keys(manifest.domains)
  : [scope];
```

---

## Phase 3: Dispatch Domain Experts

For each domain, spawn a `developer` agent with the expertise profile injected.

### Core Expert

```typescript
const coreProfile = fs.readFileSync('.pi/expertise/core/PROFILE.md', 'utf-8');

subagent({
  agent: "developer",
  agentScope: "project",
  task: `## Expertise Context
${coreProfile}

## Audit Task: Core Domain

You are the core domain expert. Audit the packages/core directory and capabilities.json for accuracy.

### Read First
- .pi/expertise/core/PROFILE.md (already injected above)
- dev/catalog/capabilities.json
- packages/core/src/services/ (scan directory)
- packages/core/src/integrations/ (scan directory)

### Audit Scope
1. **LEARNINGS.md coverage**: Check each directory in packages/core/src/ has LEARNINGS.md if it has significant code
2. **capabilities.json accuracy**: 
   - Do all services listed exist? Are any services missing?
   - Do all integrations listed exist? Are any missing?
   - Are paths correct?
3. **Expertise profile accuracy**: Does .pi/expertise/core/PROFILE.md accurately describe the current architecture?

### Output Format
Write your findings to /tmp/audit-core.md using this EXACT format:

\`\`\`markdown
# Audit: core

## Findings
- [✅] packages/core/src/services/LEARNINGS.md: Exists and up to date
- [⚠️] packages/core/src/integrations/calendar/LEARNINGS.md: Missing (should exist)
- [❌] capabilities.json: Missing 'conversations' integration entry

## Auto-Fixed
(Leave empty if ${dryRun ? 'dry-run mode' : 'nothing auto-fixed'})

## Proposed Changes (require approval)

### capabilities.json additions
\`\`\`json
{
  "id": "conversations-integration",
  "type": "integration",
  ...
}
\`\`\`

### Profile updates
- File: .pi/expertise/core/PROFILE.md
- Change: Add 'conversations' to integration list
\`\`\`

### Rules
- ${dryRun ? 'DRY_RUN=true: Do NOT modify any files. Report only.' : 'You may auto-fix LEARNINGS.md gaps within your domain.'}
- Do NOT edit capabilities.json directly (orchestrator handles this)
- Verify files are exclusively in your domain before auto-fixing
- Use exact JSON format for proposed capabilities.json changes
`
})
```

### CLI Expert

```typescript
const cliProfile = fs.readFileSync('.pi/expertise/cli/PROFILE.md', 'utf-8');

subagent({
  agent: "developer",
  agentScope: "project",
  task: `## Expertise Context
${cliProfile}

## Audit Task: CLI Domain

You are the CLI domain expert. Audit the packages/cli directory and capabilities.json commands section.

### Read First
- .pi/expertise/cli/PROFILE.md (already injected above)
- dev/catalog/capabilities.json
- packages/cli/src/commands/ (scan directory)
- packages/cli/LEARNINGS.md

### Audit Scope
1. **LEARNINGS.md coverage**: Check packages/cli/ and packages/cli/src/commands/ have up-to-date LEARNINGS.md
2. **capabilities.json accuracy**:
   - Are all CLI commands documented?
   - Are command entrypoints correct?
   - Are any commands missing from capabilities.json?
3. **README.md commands section**: Does the main README.md accurately list available commands?

### Output Format
Write your findings to /tmp/audit-cli.md using the EXACT format from SKILL.md.

### Rules
- ${dryRun ? 'DRY_RUN=true: Do NOT modify any files. Report only.' : 'You may auto-fix LEARNINGS.md gaps within your domain.'}
- Do NOT edit capabilities.json directly
- Verify files are exclusively in your domain before auto-fixing
`
})
```

### Runtime Expert

```typescript
const coreProfile = fs.readFileSync('.pi/expertise/core/PROFILE.md', 'utf-8');

subagent({
  agent: "developer",
  agentScope: "project",
  task: `## Expertise Context
${coreProfile}

## Audit Task: Runtime Domain

You are the runtime domain expert. Audit the packages/runtime directory, GUIDE.md, and UPDATES.md.

### Read First
- packages/runtime/GUIDE.md
- packages/runtime/UPDATES.md
- packages/runtime/skills/ (scan directory)
- packages/runtime/tools/ (scan directory)
- packages/runtime/skills/LEARNINGS.md

### Audit Scope
1. **GUIDE.md accuracy**: 
   - Are all skills listed correctly?
   - Are skill descriptions accurate?
   - Are there missing skills?
2. **UPDATES.md**: Is it up to date with recent changes?
3. **LEARNINGS.md coverage**: Check packages/runtime/{skills,tools,rules}/ have LEARNINGS.md

### Output Format
Write your findings to /tmp/audit-runtime.md using the EXACT format from SKILL.md.

### Rules
- ${dryRun ? 'DRY_RUN=true: Do NOT modify any files. Report only.' : 'You may auto-fix documentation corrections within your domain.'}
- Flag skill additions/removals for approval
`
})
```

### Build Expert

```typescript
subagent({
  agent: "developer",
  agentScope: "project",
  task: `## Audit Task: Build Domain

You are the build domain expert. Audit the .pi directory, standards, expertise profiles, and memory.

### Read First
- .pi/standards/build-standards.md
- .pi/standards/maintenance.md
- .pi/skills/ (list all skills)
- .pi/extensions/ (list all extensions)
- .pi/agents/ (list all agents)
- memory/MEMORY.md

### Audit Scope
1. **Standards accuracy**: Do .pi/standards/*.md accurately reflect current practices?
2. **Skill coverage**: Do all .pi/skills/ have appropriate LEARNINGS.md where needed?
3. **Extension coverage**: Do .pi/extensions/ have LEARNINGS.md where needed?
4. **Agent definitions**: Are .pi/agents/*.md consistent and up to date?
5. **Memory index**: Is memory/MEMORY.md index accurate and complete?

### Output Format
Write your findings to /tmp/audit-build.md using the EXACT format from SKILL.md.

### Rules
- ${dryRun ? 'DRY_RUN=true: Do NOT modify any files. Report only.' : 'You may make minor updates to standards.'}
- Flag profile structural changes for approval
`
})
```

### Docs Expert

```typescript
subagent({
  agent: "developer",
  agentScope: "project",
  task: `## Audit Task: Root Documentation

You are the docs domain expert. Audit the root-level documentation files.

### Read First
- README.md
- SETUP.md
- DEVELOPER.md
- AGENTS.md
- ONBOARDING.md

### Audit Scope
1. **Link validation**: Check for broken internal links (relative paths that don't exist)
2. **Feature accuracy**: Do feature lists match actual capabilities?
3. **Command accuracy**: Are CLI commands listed correctly?
4. **Cross-reference consistency**: Do docs reference each other correctly?
5. **Completeness**: Are there obvious gaps in documentation?

### Output Format
Write your findings to /tmp/audit-docs.md using the EXACT format from SKILL.md.

### Rules
- ${dryRun ? 'DRY_RUN=true: Do NOT modify any files. Report only.' : 'You may fix typos and dead internal links.'}
- Flag feature list changes for approval
`
})
```

---

## Phase 4: Collect Reports

After all experts complete, collect their reports:

```typescript
const reports = {};
for (const domain of domains) {
  const reportPath = `/tmp/audit-${domain}.md`;
  if (fs.existsSync(reportPath)) {
    reports[domain] = fs.readFileSync(reportPath, 'utf-8');
  } else {
    console.warn(`⚠️ Missing report for ${domain}`);
  }
}
```

---

## Phase 5: Cross-Cutting Checks (Orchestrator-Owned)

The orchestrator handles checks that span domains:

### AGENTS.md Consistency

```typescript
// Check that AGENTS.md skills section matches actual skills
const agentsSkills = parseSkillsFromAgentsMd('AGENTS.md');
const actualSkills = fs.readdirSync('packages/runtime/skills')
  .filter(f => fs.statSync(`packages/runtime/skills/${f}`).isDirectory());

const missing = actualSkills.filter(s => !agentsSkills.includes(s));
const extra = agentsSkills.filter(s => !actualSkills.includes(s));

if (missing.length > 0 || extra.length > 0) {
  findings.push({
    domain: 'cross-cutting',
    type: 'warning',
    message: `AGENTS.md skills mismatch. Missing: ${missing.join(', ')}. Extra: ${extra.join(', ')}`
  });
}
```

### Memory Index Accuracy

```typescript
// Check memory/MEMORY.md index references valid entries
const memoryIndex = parseMemoryIndex('memory/MEMORY.md');
const actualEntries = fs.readdirSync('memory/entries');

for (const ref of memoryIndex) {
  if (!actualEntries.includes(ref.filename)) {
    findings.push({
      domain: 'cross-cutting',
      type: 'error',
      message: `memory/MEMORY.md references non-existent entry: ${ref.filename}`
    });
  }
}
```

---

## Phase 6: Extract Structural Changes

Parse all reports to extract items requiring approval:

```typescript
const approvalItems = [];

for (const [domain, report] of Object.entries(reports)) {
  // Extract capabilities.json proposals
  const capsMatch = report.match(/### capabilities\.json additions\n```json\n([\s\S]*?)```/);
  if (capsMatch) {
    try {
      const proposal = JSON.parse(capsMatch[1]);
      approvalItems.push({
        domain,
        type: 'capabilities.json',
        description: `Add '${proposal.id}' ${proposal.type}`,
        payload: proposal
      });
    } catch (e) {
      console.warn(`Failed to parse capabilities.json proposal from ${domain}`);
    }
  }

  // Extract profile updates
  const profileMatches = report.matchAll(/### Profile updates\n- File: (.+)\n- Change: (.+)/g);
  for (const match of profileMatches) {
    approvalItems.push({
      domain,
      type: 'profile',
      file: match[1],
      description: match[2]
    });
  }
}
```

---

## Phase 7: Approval Gate

If not dry-run and there are items requiring approval:

```typescript
if (!dryRun && approvalItems.length > 0) {
  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  📋 Proposed Changes                                            │
├─────────────────────────────────────────────────────────────────┤`);

  approvalItems.forEach((item, i) => {
    console.log(`│  ${i + 1}. ${item.type}: ${item.description}`);
  });

  console.log(`│                                                                 │
│  [Y] Apply all  [N] Skip all  [1,2,...] Select items           │
└─────────────────────────────────────────────────────────────────┘`);

  const response = await prompt('Choice: ');
  
  if (response === 'Y' || response === 'y') {
    approved = approvalItems;
    skipped = [];
  } else if (response === 'N' || response === 'n') {
    approved = [];
    skipped = approvalItems;
  } else {
    // Parse numbers like "1,3,5" or "1 3 5"
    const indices = response.split(/[,\s]+/).map(n => parseInt(n) - 1);
    approved = indices.map(i => approvalItems[i]).filter(Boolean);
    skipped = approvalItems.filter((_, i) => !indices.includes(i));
  }
}
```

---

## Phase 8: Apply Approved Changes

### Capabilities.json Merge

```typescript
// Single-point edit: orchestrator owns all capabilities.json changes
const capsApproved = approved.filter(i => i.type === 'capabilities.json');

if (capsApproved.length > 0) {
  const caps = JSON.parse(fs.readFileSync('dev/catalog/capabilities.json', 'utf-8'));
  
  for (const item of capsApproved) {
    // Check for duplicates
    const exists = caps.capabilities.some(c => c.id === item.payload.id);
    if (!exists) {
      caps.capabilities.push(item.payload);
      caps.lastUpdated = new Date().toISOString().split('T')[0];
    }
  }
  
  fs.writeFileSync('dev/catalog/capabilities.json', JSON.stringify(caps, null, 2));
}
```

### Save Deferred Items

```typescript
if (skipped.length > 0) {
  const deferredPath = `dev/work/audits/${date}-deferred.md`;
  const content = `# Deferred Audit Items — ${date}

These items were identified but not applied during the audit.

## Items

${skipped.map((item, i) => `${i + 1}. **${item.type}**: ${item.description}
   - Domain: ${item.domain}
   - Reason: Skipped by user`).join('\n\n')}

## Next Steps

Review these items and apply manually if needed, or address in the next audit run.
`;
  
  fs.writeFileSync(deferredPath, content);
}
```

---

## Phase 9: Generate Final Report

Use the report template to generate the final audit report:

```typescript
const date = new Date().toISOString().split('T')[0];
const reportPath = `dev/work/audits/${date}.md`;

const report = generateReport(template, {
  date,
  domains: Object.keys(reports),
  findings: aggregateFindings(reports),
  autoFixed: aggregateAutoFixed(reports),
  approved,
  skipped,
  crossCutting: findings.filter(f => f.domain === 'cross-cutting')
});

fs.writeFileSync(reportPath, report);
console.log(`\n✅ Audit report written to ${reportPath}`);
```

---

## Error Handling

| Error | Recovery |
|-------|----------|
| Expert fails to produce report | Log warning, continue with other domains |
| Invalid report format | Log warning, include raw report in final output |
| capabilities.json parse error | Skip capabilities changes, flag in report |
| File permission error | Log error, flag for manual intervention |

---

## References

- **SKILL.md**: Main skill file with workflow overview
- **manifest.yaml**: Domain configurations and file lists
- **templates/audit-report.md**: Report template
