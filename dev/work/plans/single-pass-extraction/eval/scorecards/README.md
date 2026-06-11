# Scorecards

One JSON per (run-date, mode, meeting) — schema in `../judge-rubric.md`.
Produced by the judge pass over `eval/runs/` raw outputs (local, gitignored);
scorecards are committed (results are not the harness — pre-mortem risk 16).

No scorecards yet: the overnight build ran only the compliance-0609 smoke
(both modes, raw outputs local). The full gate run + judge pass is John's
morning call.
