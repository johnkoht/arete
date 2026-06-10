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

import type {
  PersonBrief,
  ProjectBrief,
  AreaBrief,
  MeetingBrief,
  BriefSection,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSection(section: BriefSection): string {
  const lines: string[] = [`## ${section.heading}`, ''];
  if (section.body) {
    lines.push(section.body);
    if (section.bullets.length > 0) lines.push('');
  }
  for (const bullet of section.bullets) {
    lines.push(`- ${bullet}`);
  }
  if (section.truncated) {
    const count =
      typeof section.truncatedCount === 'number' && section.truncatedCount > 0
        ? `${section.truncatedCount} item${section.truncatedCount === 1 ? '' : 's'} not shown`
        : 'items not shown';
    lines.push('');
    lines.push(`_[truncated: ${count} — older items dropped first]_`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderSources(sources: string[]): string {
  if (sources.length === 0) return '';
  const lines = ['## Sources', ''];
  for (const s of sources) lines.push(`- \`${s}\``);
  lines.push('');
  return lines.join('\n');
}

function renderGlobalTruncation(brief: { truncated: boolean; truncatedSections?: string[] }): string {
  if (!brief.truncated) return '';
  const dropped = brief.truncatedSections ?? [];
  const note =
    dropped.length > 0
      ? `_[truncated: ${dropped.length} section${dropped.length === 1 ? '' : 's'} dropped — ${dropped.join(', ')}]_`
      : `_[truncated: trailing sections dropped]_`;
  return `\n${note}\n`;
}

// ---------------------------------------------------------------------------
// Mode formatters
// ---------------------------------------------------------------------------

export function formatPersonBriefMarkdown(brief: PersonBrief): string {
  const parts: string[] = [];
  const headerLines = [`# Brief: ${brief.subject}`, ''];
  const meta = brief.metadata;
  const metaBits = [
    meta.role ? `**Role:** ${meta.role}` : null,
    meta.team ? `**Team:** ${meta.team}` : null,
    meta.company ? `**Company:** ${meta.company}` : null,
    meta.email ? `**Email:** ${meta.email}` : null,
    meta.category ? `**Category:** ${meta.category}` : null,
  ].filter((s): s is string => s !== null);
  if (metaBits.length > 0) headerLines.push(metaBits.join(' · '), '');
  parts.push(headerLines.join('\n'));

  for (const section of brief.sections) parts.push(renderSection(section));
  parts.push(renderSources(brief.sources));
  parts.push(renderGlobalTruncation(brief));
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function formatProjectBriefMarkdown(brief: ProjectBrief): string {
  const parts: string[] = [];
  const headerLines = [`# Brief: ${brief.subject}`, ''];
  const meta = brief.metadata;
  const metaBits = [
    meta.area ? `**Area:** ${meta.area}` : null,
    meta.status ? `**Status:** ${meta.status}` : null,
    meta.started ? `**Started:** ${meta.started}` : null,
  ].filter((s): s is string => s !== null);
  if (metaBits.length > 0) headerLines.push(metaBits.join(' · '), '');
  // Phase 12 AC6 / R9 — visible one-liners for unresolved or divergent area.
  if (meta.areaNote) headerLines.push(`_${meta.areaNote}_`, '');
  if (meta.areaWarning) headerLines.push(`_⚠️ ${meta.areaWarning}_`, '');
  parts.push(headerLines.join('\n'));

  for (const section of brief.sections) parts.push(renderSection(section));
  parts.push(renderSources(brief.sources));
  parts.push(renderGlobalTruncation(brief));
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function formatAreaBriefMarkdown(brief: AreaBrief): string {
  const parts: string[] = [];
  const headerLines = [`# Brief: Area — ${brief.metadata.name}`, ''];
  if (brief.metadata.status) headerLines.push(`**Status:** ${brief.metadata.status}`, '');
  parts.push(headerLines.join('\n'));

  for (const section of brief.sections) parts.push(renderSection(section));
  parts.push(renderSources(brief.sources));
  parts.push(renderGlobalTruncation(brief));
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function formatMeetingBriefMarkdown(brief: MeetingBrief): string {
  const parts: string[] = [];
  const headerLines = [`# Brief: ${brief.subject}`, ''];
  const meta = brief.metadata;
  const metaBits = [
    meta.date ? `**Date:** ${meta.date}` : null,
    meta.duration ? `**Duration:** ${meta.duration}` : null,
    meta.attendees.length > 0
      ? `**Attendees:** ${meta.attendees.join(', ')}`
      : null,
    meta.unresolved
      ? `_**Unresolved**: no calendar match, no saved file — best-effort title-only brief._`
      : null,
    meta.projectOverride
      ? `_Project pinned via \`--project ${meta.projectOverride}\`._`
      : null,
    meta.inferredArea
      ? `_Area inferred: ${meta.inferredArea.slug} (confidence ${meta.inferredArea.confidence.toFixed(2)})._`
      : null,
  ].filter((s): s is string => s !== null);
  if (metaBits.length > 0) headerLines.push(metaBits.join('\n'), '');
  parts.push(headerLines.join('\n'));

  for (const section of brief.sections) parts.push(renderSection(section));
  parts.push(renderSources(brief.sources));
  parts.push(renderGlobalTruncation(brief));
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
