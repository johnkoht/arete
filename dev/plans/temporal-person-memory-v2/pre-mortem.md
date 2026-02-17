# Pre-Mortem: Temporal + Person Memory v2

## Risk 1: Noisy extraction
- **Failure mode**: false positives pollute person profiles.
- **Mitigation**: conservative phrase patterns; minimum mention threshold (default 2); source references retained.

## Risk 2: Profile corruption
- **Failure mode**: refresh overwrites manual notes.
- **Mitigation**: replace only marker-delimited auto section; keep all other content untouched.

## Risk 3: Repeated-section duplication
- **Failure mode**: running refresh multiple times appends duplicate sections.
- **Mitigation**: idempotent marker-based upsert + regression test.

## Risk 4: CLI discoverability gap
- **Failure mode**: feature exists but builders don’t know command.
- **Mitigation**: update CLI help, GUIDE, AGENTS sources.

## Risk 5: Regression in existing intelligence
- **Failure mode**: memory timeline/search behavior changes unintentionally.
- **Mitigation**: additive implementation only; run full typecheck + test suite.
