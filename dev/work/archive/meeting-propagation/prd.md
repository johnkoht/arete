# PRD: Meeting Propagation

**Version**: 1.0  
**Status**: Implemented (2026-02-06)  
**Depends on**: None (foundation)  
**Feeds into**: Meeting Intelligence PRD

---

## 1. Problem & Goals

### Problem

Meetings are captured (Fathom, save-meeting) but their content does not flow into people or memory. PMs must manually update person files and log decisions. There is no structured link between meetings and people, and no consistent way to extract decisions and learnings into institutional memory.

### Goals

- **Meeting–people linkage**: Meeting files include structured frontmatter (attendees, attendee_ids) so people and meetings are linked.
- **People propagation**: A process-meetings skill creates or updates person files from meeting attendees, with internal vs external (customer/user) classification.
- **Memory extraction**: Process-meetings proposes decisions and learnings for user review and appends approved items to `memory/items/`.
- **Template enrichment**: Meeting template outputs YAML frontmatter and supports optional `company` and `pillar` for downstream use.
- **Documentation**: AGENTS.md, SETUP.md, and pm-workspace.mdc updated; skill discoverable.

### Out of Scope

- Company pages (use people with `company` field).
- Task/commitment system.
- Background sync or automation.
- LLM-powered meeting analysis (Fathom/save-meeting already provide summary/action items).

---

## 2. User Stories (Summary)

1. As a PM I can save meetings (Fathom or manual) and have them stored with structured frontmatter (date, title, attendees, source) so downstream skills can link to people.
2. As a PM I can run the **process-meetings** skill to create or update person files from meeting attendees, with internal vs customer/user classification based on email domain.
3. As a PM I can run **process-meetings** to review proposed decisions and learnings from meetings and approve them for `memory/items/decisions.md` and `memory/items/learnings.md`.
4. As a PM I can configure my internal email domain (e.g. in `arete.yaml` or `context/`) so attendees from my org are classified as internal.
5. As a PM I can find process-meetings and meeting propagation documentation in AGENTS.md, SETUP.md, and the skills index.

---

## 3. Requirements

(Full requirements in original PRD — see build entry 2026-02-06_meeting-propagation-prd.md)

---

## 4. Acceptance Criteria (Implementation)

- [x] Meeting template outputs YAML frontmatter with `title`, `date`, `source`, `attendees`, `attendee_ids`, `company`, `pillar`.
- [x] `MeetingForSave` extended with `attendee_ids?`, `company?`, `pillar?`; Fathom and meeting add pass through when provided.
- [x] `arete.yaml` supports optional `internal_email_domain`; documented in SETUP.md and skill.
- [x] Skill file exists: `.cursor/skills/process-meetings/SKILL.md`
- [x] AGENTS.md, SETUP.md, pm-workspace.mdc updated.
