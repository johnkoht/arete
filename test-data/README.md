# Test Data

Fixture data for local development and testing of Areté. **Not included in the published npm package.**

## Purpose

`test-data/` is the **product-side seeded corpus** used to validate end-user PM/builder workflows in a realistic workspace.

This is distinct from the developer fixture factory:

- **Product realism (seeded):** `test-data/` copied by `arete seed test-data`
- **Developer test fixtures:** `packages/core/test/fixtures/` (shared programmatic test setup)

Both should follow the same canonical scenario contract so manual/e2e behavior and automated tests stay aligned.

## Usage

From an Areté workspace (with the package linked via `npm link` or `arete install --source symlink`):

```bash
arete seed test-data
```

## Canonical Scenario Contract (v1)

The seeded corpus is expected to support validation for these end-product workflows:

1. `arete brief --for "..."`
2. `arete context --for "..."`
3. `arete context --inventory`
4. `arete memory search "..."`
5. `arete memory timeline "..."`
6. `arete resolve "..."`
7. `arete people show <slug>`
8. `arete people memory refresh`
9. Planning/agenda/PRD-prep skills using workspace context

### Expected output signals

Scenarios should assert stable product signals, not fragile phrasing:

- Correct person/project/meeting entities surfaced
- Correct thread/theme surfaced (onboarding, renewal, blocker arc)
- Relevant actions/open items surfaced for briefing workflows
- Stale vs fresh context behavior visible in inventory mode
- Ambiguous references resolved to expected entity candidates

## Contents (current baseline)

- **meetings/** — sample meetings with overlapping attendees, action items, decisions
- **people/** — person files across internal and customer categories
- **plans/** — quarter and week plan files
- **projects/** — lifecycle fixtures (`active/`, `archive/`) plus one legacy flat project for backward-compat seed testing
- **memory/** — decisions and learnings (seeded to `.arete/memory/items/`)
- **context/** — product/business context files
- **TEST-SCENARIOS.md** — prompt playbook copied to workspace root with expected outcomes
- **MANUAL-SMOKE.md** — concise command checklist for manual seeded-workspace validation

## Config

The seed command merges `internal_email_domain: "acme.com"` into `arete.yaml` for process-meetings classification.
