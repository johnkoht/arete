## Review: Onboarding Improvements Plan

**Type**: Plan  
**Audience**: User-facing capability (implemented by Builder in Areté runtime)

### Concerns

1. **Audience clarity**: Plan is clearly about end-user onboarding value, but implementation placement is not explicit.
   - Suggestion: Add one line in PRD execution notes specifying expected code locations (e.g., runtime skills/templates vs dev tooling artifacts).

2. **Dependency precision**: Shared profile/config model is listed, but contract ownership is not assigned.
   - Suggestion: Assign owner + schema checkpoint for profile/config contract before Phase 2 starts.

3. **Metric operability**: KPIs are defined, but thresholds for continue/kill are not numeric yet.
   - Suggestion: Add initial threshold bands (e.g., minimum completion/acceptance targets) in child PRDs before execution.

4. **Execution readiness**: Umbrella PRD exists, but child PRDs are referenced as future outputs.
   - Suggestion: Create the three child PRDs before execute-prd handoff so scope stays bounded per stream.

### Strengths

- Stream boundaries are now clearly separated (onboarding shell vs context dump vs people intelligence).
- Plan is phase-first and adoption-focused, reducing risk of architecture-first overbuild.
- Review-first draft promotion guardrail is explicit and trust-preserving.
- Unknown queue + low-friction triage directly addresses misclassification/noise risks.

### Devil's Advocate

**If this fails, it will be because...** Phase boundaries erode under implementation pressure, pulling People Intelligence complexity into Phase 1 and delaying first visible value.

**The worst outcome would be...** A coupled “smart onboarding” system ships late with noisy triage and weak trust signals, harming early adoption and making rollback expensive.

### Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding
