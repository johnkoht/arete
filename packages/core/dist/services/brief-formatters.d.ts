/**
 * Phase 9 — Markdown formatters for typed-mode briefs.
 *
 * Pure functions: TypedBrief in, markdown out. No I/O, no LLM. Sections
 * render in fixed order; empty sections are dropped at assembly time
 * (formatters trust the input). Truncation markers are emitted when
 * `section.truncated` is set or `brief.truncated` is set globally.
 *
 * Plan: phase-9-brief-primitive-restore/plan.md §"Architecture" / "Markdown
 * formatters". AC11 truncation marker behavior.
 */
import type { PersonBrief, ProjectBrief, AreaBrief, MeetingBrief } from '../models/index.js';
export declare function formatPersonBriefMarkdown(brief: PersonBrief): string;
export declare function formatProjectBriefMarkdown(brief: ProjectBrief): string;
export declare function formatAreaBriefMarkdown(brief: AreaBrief): string;
export declare function formatMeetingBriefMarkdown(brief: MeetingBrief): string;
//# sourceMappingURL=brief-formatters.d.ts.map