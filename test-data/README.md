# Test Data

Fixture data for local development and testing of Areté. **Not included in the published npm package.**

## Usage

From an Areté workspace (with the package linked via `npm link` or `arete install --source symlink`):

```bash
arete seed test-data
```

## Contents

- **meetings/** — 5 sample meetings with overlapping attendees, action items, decisions
- **people/** — 4 person files (2 internal, 2 customers)
- **plans/** — Quarter and week plan files for current period
- **projects/** — 1 active discovery project
- **memory/** — Sample decisions and learnings
- **context/** — goals-strategy.md with org pillars/OKRs
- **TEST-SCENARIOS.md** — User playbook copied to workspace root; lists prompts for testing meeting-prep, daily-plan, process-meetings, etc.

## Config

The seed command merges `internal_email_domain: "acme.com"` into arete.yaml for process-meetings classification.
