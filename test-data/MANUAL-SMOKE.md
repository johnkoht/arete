# Manual Smoke Script (Seeded Product Workflow Validation)

Run these checks in a separate Areté-enabled workspace after:

```bash
arete seed test-data
```

## 1) People and corpus size

```bash
arete people list --json
```

Expect signals:
- `count >= 6`
- includes `jane-doe`, `alex-eng`, `bob-buyer`, `carol-champion`, `david-decision-maker`

## 2) Context + inventory

```bash
arete context --for "onboarding discovery" --json
arete context --inventory --json
```

Expect signals:
- onboarding project/context files returned
- non-zero `totalFiles`
- stale/fresh differentiation present (`staleCount > 0` in seeded corpus)

## 3) Brief quality

```bash
arete brief --for "prep for call with Bob Buyer" --json
```

Expect signals:
- Bob Buyer present
- Acme/customer thread present
- relevant actions/context included

## 4) Memory quality

```bash
arete memory search "onboarding" --json
arete memory timeline "auth" --json
```

Expect signals:
- search returns decisions/learnings related to onboarding
- timeline shows auth blocker arc across dated entries

## 5) Resolve + person memory

```bash
arete resolve "Alex" --json
arete people memory refresh --json
```

Expect signals:
- resolve returns `alex-eng`
- refresh scans expanded people/meetings set and succeeds
