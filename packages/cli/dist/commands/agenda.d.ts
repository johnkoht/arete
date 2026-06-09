/**
 * Agenda commands — `arete agenda scaffold` (Approach B: deterministic
 * agenda pre-seeding for the Phase 9 follow-up F3 synthesis fix).
 *
 * `arete agenda scaffold --meeting "<title>"` assembles the typed MeetingBrief,
 * pulls the per-attendee qualitative signal the brief does not surface
 * (`## 1:1 Discussion Topics`, `## Next 1:1 Focus`), loads the meeting-type
 * agenda template, and routes real candidate bullets into each template
 * section — emitting a PRE-POPULATED agenda skeleton the agent curates rather
 * than an empty template it must synthesize from scratch.
 *
 * Plan: dev/work/plans/arete-v2-chef-orchestrator/phase-9-followup-agenda-synthesis/plan.md
 */
import type { Command } from 'commander';
export declare function registerAgendaCommands(program: Command): void;
//# sourceMappingURL=agenda.d.ts.map