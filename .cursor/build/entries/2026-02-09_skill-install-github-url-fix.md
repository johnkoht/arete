# Skill Install GitHub URL Fix

**Date**: 2026-02-09
**Status**: Complete
**Tests**: 325/325 passing

## Problem

User reported two bugs when trying to install skills from GitHub:

```bash
# Bug 1: --skill flag not supported on `skill add` command
arete skill add parcadei/continous-claude-v3 --skill premortem
# Error: unknown option '--skill'

# Bug 2: Full GitHub URLs treated as local paths
arete skill install https://github.com/github/awesome-copilot --skill prd
# Error: Path not found: https://github.com/github/awesome-copilot
```

## Root Cause

1. **CLI routing**: `skill add` command existed but didn't support `--skill` flag; it was stubbed with "not yet implemented"
2. **URL detection logic**: `isLikelySkillsSh` check failed for full GitHub URLs because it looked for path separator (`/`) which exists in URLs

Original detection logic:
```typescript
const isLikelySkillsSh = source.includes('/') && 
                         !source.startsWith('.') && 
                         !source.startsWith('/') && 
                         !source.includes(sep);
```

This failed because `https://github.com/owner/repo` contains `/` (the path separator on Unix), making `!source.includes(sep)` false.

## Solution

### 1. Added GitHub URL parsing

Created `parseSkillSource()` helper function that:
- Detects local paths (starts with `.`, `/`, `~`)
- Parses GitHub URLs and extracts `owner/repo`
- Validates `owner/repo` format (exactly 2 parts, no backslashes)
- Returns normalized `owner/repo` for skills.sh consumption

**Supported formats**:
- `owner/repo` → `owner/repo`
- `https://github.com/owner/repo` → `owner/repo`
- `https://github.com/owner/repo.git` → `owner/repo`
- `https://github.com/owner/repo/` → `owner/repo` (trailing slash ok)
- `http://github.com/owner/repo` → `owner/repo`

**Rejected formats** (treated as local):
- `https://github.com/owner/repo/tree/main/skills/prd` (deep paths)
- `./path`, `/path`, `~/path` (local indicators)
- `some/random/path/with/slashes` (more than 2 parts)

### 2. Made `skill add` work as alias for `install`

Updated CLI definition:
```typescript
skillCmd
  .command('add <source>')
  .description('Install a skill (alias for install)')
  .option('--skill <name>', 'For multi-skill repos: specify which skill to install')
  .option('--json', 'Output as JSON')
  .option('--yes', 'Skip prompts (e.g. use for role)')
  .action((source, opts) => skillCommand('install', { name: source, skill: opts.skill, ...opts }));
```

Removed the stubbed `addSkill()` function (no longer needed).

### 3. Added comprehensive tests

Created `test/commands/skill-url-parsing.test.ts` with 11 test cases covering:
- `owner/repo` format
- Full GitHub URLs (http/https, with/without .git, with/without trailing slash)
- Local path detection (relative, absolute, home)
- Deep GitHub URL paths (should be rejected)
- Edge cases (single word, multiple slashes)

## Usage

Now users can install skills using any of these formats:

```bash
# Short format
arete skill install owner/repo
arete skill add owner/repo  # alias

# Full GitHub URLs
arete skill install https://github.com/owner/repo
arete skill install https://github.com/owner/repo.git
arete skill install http://github.com/owner/repo

# Multi-skill repos (with --skill flag)
arete skill install owner/repo --skill prd
arete skill install https://github.com/owner/repo --skill prd
arete skill add https://github.com/owner/repo --skill prd

# Local paths still work
arete skill install ./path/to/skill
arete skill install ~/skills/my-skill
```

## Files Changed

1. `src/cli.ts` - Updated `skill add` command to call `install` with `--skill` support
2. `src/commands/skill.ts` - Added `parseSkillSource()`, removed `addSkill()`, updated `installSkill()`
3. `test/commands/skill-url-parsing.test.ts` - New comprehensive test suite

## Learnings

### For collaboration

- When user reports an issue with exact error messages and commands, they're usually correct - investigate thoroughly rather than assuming it's user error
- The detection logic was brittle because it relied on OS-specific path separators to distinguish URLs from local paths
- Regex-based URL parsing is more reliable than heuristics

### For the codebase

- GitHub URLs need explicit parsing; don't rely on path separator heuristics
- `skill add` and `skill install` should be synonyms (common expectation from npm/yarn users)
- The `--skill` flag pattern (for multi-skill repos) extends naturally to URL formats
- Test cross-platform path handling carefully (Unix `/` vs Windows `\`)

## Related

- Original issue: User trying to install `parcadei/continous-claude-v3 --skill premortem` and `https://github.com/github/awesome-copilot --skill prd`
- Previous work: Added `--skill` flag to `skill install` in earlier session (2026-02-09)
- Skills.sh integration: Uses `npx skills add <owner/repo> --skill <name>` under the hood
