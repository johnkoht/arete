# Areté Distribution Architecture Plan

**Created**: 2026-02-04  
**Status**: Parked for future consideration  
**Context**: Ideas for making Areté more reusable, updatable, and extensible

---

## Problem Statement

Currently Areté is a GitHub template repository. Users clone once and never receive updates. This limits:
- Update propagation (new skills, bug fixes)
- Customization (can't override individual skills)
- Community contribution (no marketplace)
- Onboarding (manual context setup)

## Proposed Solution: CLI + Registry Model

A dedicated `arete` CLI that manages workspace lifecycle, with a community registry for skill discovery.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Workspace                          │
├─────────────────────────────────────────────────────────────────┤
│  arete.yaml              # Manifest (versions, installed skills) │
│  .cursor/                                                        │
│  ├── rules/              # Core rules (managed by CLI)          │
│  ├── skills/             # Skills Cursor sees (merged view)     │
│  ├── skills-core/        # Vendored core skills (gitignored)    │
│  ├── skills-local/       # User overrides + custom skills       │
│  └── tools/              # Tools (managed by CLI)               │
│  context/                # User content                          │
│  projects/               # User content                          │
│  memory/                 # User content                          │
└─────────────────────────────────────────────────────────────────┘
         │
         │  arete update / arete skill add
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Areté Registry (GitHub)                       │
├─────────────────────────────────────────────────────────────────┤
│  arete-core/             # Core skills, rules, templates         │
│  arete-registry/         # Community skill index                 │
│    └── registry.yaml     # Skill metadata + source URLs         │
└─────────────────────────────────────────────────────────────────┘
```

---

## CLI Commands

### Setup
- `arete init [dir]` - Create new workspace with guided onboarding
- `arete init --context-interview` - Interactive context gathering mode

### Updates
- `arete update` - Pull latest core skills/rules/templates
- `arete update --check` - Show available updates without applying
- `arete status` - Show installed versions, available updates

### Skills Management
- `arete skill list` - List installed skills
- `arete skill search [query]` - Search registry for community skills
- `arete skill add [name]` - Install skill from registry
- `arete skill remove [name]` - Uninstall skill
- `arete skill override [name]` - Create local copy for customization
- `arete skill publish` - Submit skill to community registry

### Context
- `arete context init` - Interactive context file population
- `arete context check` - Validate context file completeness

---

## Skill Override Mechanism

### Resolution Order (highest to lowest priority)
1. **Local overrides** (`.cursor/skills-local/[name]/`)
2. **Community skills** (`.cursor/skills-community/[name]/`)
3. **Core skills** (`.cursor/skills-core/[name]/`)

### Override Flow
```bash
# User wants to customize the PRD template
arete skill override create-prd

# Creates: .cursor/skills-local/create-prd/SKILL.md
# Pre-populated with core version
# User edits as needed
# Future `arete update` won't touch this
```

---

## Manifest File (arete.yaml)

```yaml
schema: 1
core:
  version: "0.5.2"
  updated: "2026-02-01"

skills:
  core:
    - discovery
    - create-prd
    - competitive-analysis
    # ... etc
  
  community:
    - name: interview-synthesis
      source: github:pmtools/interview-synthesis
      version: "1.0.3"
  
  local:
    - create-prd  # Overridden

overrides:
  - create-prd
```

---

## Community Registry

GitHub-based registry for discovering and sharing skills.

### Registry Entry Format
```yaml
skills:
  - name: interview-synthesis
    author: pmtools
    description: Analyze user interview transcripts and extract insights
    source: github:pmtools/interview-synthesis
    version: "1.0.3"
    tags: [discovery, research, interviews]
    verified: true
```

### Verification Tiers
- **Unverified**: Community submitted, use at own risk
- **Verified**: Reviewed by maintainers for quality/safety
- **Official**: Maintained by Areté core team

---

## Update Rules

- **Never touch**: `context/`, `memory/`, `projects/`, `resources/`, `scratchpad.md`
- **Replace**: `skills-core/`, `rules/` (unless user has local override)
- **Merge carefully**: `templates/` (prefer user changes)
- **Preserve**: `skills-local/`, `arete.yaml`

---

## Migration Plan: Template → CLI-Managed

This section outlines how to migrate existing template-based workspaces to the new CLI-managed architecture.

### Phase 1: Prepare the New Architecture

**Create new repos:**
1. `arete-core` - Extract all system components
   - `.cursor/rules/`
   - `.cursor/skills/`
   - `.cursor/tools/`
   - `templates/`
   
2. `arete-registry` - Empty registry to start
   - `registry.yaml` (schema only)
   - `CONTRIBUTING.md` (submission guidelines)

3. `arete-cli` - The CLI tool
   - Node.js or Go implementation
   - Published to npm/homebrew

**Tag current template state:**
```bash
# In current arete repo
git tag v0.1.0-template  # Mark the "before" state
```

### Phase 2: Restructure Template Repo

Transform the template repo into a "workspace skeleton":

**Before (current):**
```
arete/
├── .cursor/
│   ├── rules/           # System
│   ├── skills/          # System  
│   └── tools/           # System
├── context/             # User (templated)
├── templates/           # System
├── projects/            # User (empty)
├── memory/              # User (templated)
└── resources/           # User (empty)
```

**After (new template):**
```
arete/
├── .cursor/
│   ├── skills/          # Merged view (gitignored except skills-local)
│   ├── skills-core/     # Managed by CLI (gitignored)
│   ├── skills-local/    # User customizations (tracked)
│   ├── rules/           # Managed by CLI (gitignored? or tracked?)
│   └── tools/           # Managed by CLI (gitignored)
├── context/             # User (templated stubs)
├── templates/           # Managed by CLI (gitignored)
├── projects/            # User
├── memory/              # User
├── resources/           # User
└── arete.yaml           # Manifest (tracked)
```

### Phase 3: Build Migration Command

The CLI needs a migration command for existing users:

```bash
arete migrate
```

**What it does:**

1. **Detect existing workspace**
   ```
   Looking for Areté workspace...
   Found: Template-based workspace (pre-CLI)
   ```

2. **Backup current state**
   ```
   Creating backup at .arete-backup-2026-02-04/
   ✓ Backed up .cursor/skills/
   ✓ Backed up .cursor/rules/
   ✓ Backed up templates/
   ```

3. **Restructure directories**
   ```
   Restructuring workspace...
   ✓ Moved skills/ → skills-local/ (preserving your customizations)
   ✓ Created skills-core/ (will be populated by CLI)
   ✓ Created arete.yaml manifest
   ```

4. **Install core**
   ```
   Installing Areté core v0.5.0...
   ✓ Downloaded core skills
   ✓ Downloaded core rules
   ✓ Downloaded templates
   ```

5. **Detect customizations**
   ```
   Checking for customizations...
   ⚠️  Found modified: create-prd/SKILL.md
      Differs from core version
      ? Keep as override? (Y/n) y
      ✓ Marked create-prd as local override
   ```

6. **Update gitignore**
   ```
   Updating .gitignore...
   ✓ Added: .cursor/skills-core/
   ✓ Added: .cursor/skills-community/
   ✓ Added: .arete-backup-*/
   ```

7. **Verify**
   ```
   Verifying workspace...
   ✓ All skills accessible
   ✓ Rules loaded
   ✓ Manifest valid
   
   Migration complete!
   Your workspace is now CLI-managed.
   
   Your customizations preserved in: .cursor/skills-local/
   Your backup is at: .arete-backup-2026-02-04/
   
   Next: Run 'arete status' to see your workspace
   ```

### Phase 4: Communicate to Existing Users

**Announcement:**
- Blog post / GitHub release explaining the change
- Clear migration instructions
- Benefits of migrating
- Option to stay on template (frozen, no updates)

**Migration incentives:**
- New skills only available via CLI
- Bug fixes require CLI
- Community skills require CLI

### Phase 5: Deprecate Template Flow

After migration period:
1. Template repo becomes thin wrapper that tells users to use CLI
2. `arete init` becomes the primary onboarding path
3. Keep template for those who want manual control

---

## Implementation Phases

### Phase 1: Core Restructure
- Separate arete-core repo with versioned releases
- Add `arete.yaml` manifest to workspace
- Create gitignore patterns for managed directories

### Phase 2: CLI Foundation
- `arete init` - workspace creation
- `arete update` - core updates
- `arete status` - show versions
- `arete migrate` - for existing users

### Phase 3: Skills Management
- `arete skill list/add/remove`
- `arete skill override`
- Override resolution logic

### Phase 4: Registry & Community
- Create registry repo structure
- `arete skill search/publish`
- Verification workflow

### Phase 5: Polish
- Context interview mode
- Documentation and examples
- Migration support period

---

## Open Questions

1. **CLI technology**: Node.js (familiar to web devs) vs Go (single binary, no deps)?
2. **Gitignore strategy**: Should rules be gitignored (managed) or tracked (visible)?
3. **Breaking changes**: How to handle when core skills have breaking changes?
4. **Offline support**: Should CLI work offline with cached versions?
5. **Workspace detection**: How does CLI know it's in an Areté workspace?

---

## Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| Git Submodules | Native git, familiar | Complex, merge conflicts, painful UX |
| NPM Package | Versioning, familiar to devs | Heavy for markdown system |
| Manual Updates | Simple | Doesn't scale, error-prone |
| Cursor-native Only | No extra tooling | Limited to global skills, no workspace overrides |

---

## References

- Current workspace structure: See `SETUP.md`
- Cursor skill format: See `.cursor/skills/*/SKILL.md`
- Cursor global skills: `~/.cursor/skills/`
