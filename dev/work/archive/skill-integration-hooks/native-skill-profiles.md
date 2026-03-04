# Native Skill Integration Profiles

Catalog of all 9 native skills with prose integration instructions, their proposed integration profiles, and the exact prose they replace.

## Schema Used

```yaml
integration:
  outputs:
    - type: project | resource | context | none
      path: "pattern/{name}/"
      template: variant-name
      index: true
  contextUpdates:
    - context/file.md
```

---

## 1. competitive-analysis

**Existing frontmatter**: `creates_project: true`, `project_template: analysis`

**Current prose** (lines ~268-271):
```
1. Update `context/competitive-landscape.md`
...
4. Run `arete index` to make all saved competitive profiles and analysis immediately searchable
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: project
      path: "projects/active/{name}-competitive-analysis/"
      template: analysis
      index: true
  contextUpdates:
    - context/competitive-landscape.md
```

---

## 2. discovery

**Existing frontmatter**: `creates_project: true`, `project_template: discovery`

**Current prose** (lines ~147, ~235):
```
**Quick summary**: Scan inputs → analyze each → synthesize themes → update README → run `arete index` → cleanup intermediate files.
...
4. Run `arete index` to make all saved research and findings immediately searchable
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: project
      path: "projects/active/{name}-discovery/"
      template: discovery
      index: true
```

---

## 3. create-prd

**Existing frontmatter**: `creates_project: true`, `project_template: definition`

**Current prose** (line ~163):
```
6. **Re-index**: Run `arete index` so the PRD is immediately findable by brief, context, and other skills.
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: project
      path: "projects/active/{name}-prd/"
      template: definition
      index: true
```

---

## 4. construct-roadmap

**Existing frontmatter**: `creates_project: true`, `project_template: roadmap`

**Current prose** (line ~298):
```
3. Run `arete index` to make the roadmap immediately searchable
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: project
      path: "projects/active/{name}-roadmap/"
      template: roadmap
      index: true
```

---

## 5. general-project

**Existing frontmatter**: `creates_project: true`, `project_template: general`

**Current prose** (lines ~89, ~100):
```
**Quick summary**: Scan inputs → analyze each → synthesize themes → update README → run `arete index` → cleanup intermediate files.
...
4. Run `arete index` to make all project content searchable
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: project
      path: "projects/active/{name}-project/"
      template: general
      index: true
```

---

## 6. capture-conversation

**Existing frontmatter**: No `creates_project` or `project_template`

**Current prose** (lines ~129-131, ~194):
```
**Directory**: Ensure `resources/conversations/` exists (create if needed).
**Filename**: `resources/conversations/{date}-{title-slug}.md`
...
After saving, run `arete index` to make the conversation immediately searchable by other skills (brief, meeting-prep, context).
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: resource
      path: "resources/conversations/{name}.md"
      index: true
```

---

## 7. save-meeting

**Existing frontmatter**: No `creates_project` or `project_template`

**Current prose** (lines ~82-83, ~92):
```
- Save the meeting to `resources/meetings/YYYY-MM-DD-slug.md`
- Update `resources/meetings/index.md` (table: Date | Title | Attendees | Recording | Topics).
...
After saving, run `arete index` to make the content immediately searchable by other skills (brief, meeting-prep, context).
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: resource
      path: "resources/meetings/{name}.md"
      index: true
```

**Note**: The index.md update is a behavioral step, not an output location. The integration profile captures the output path + indexing. The agent still needs the SKILL.md workflow to know about index.md updates. This is NOT a schema gap — the integration section is about output location and indexing, not workflow steps.

---

## 8. process-meetings

**Existing frontmatter**: No `creates_project` or `project_template`

**Current prose** (line ~89):
```
After saving, run `arete index` to make the content immediately searchable by other skills (brief, meeting-prep, context).
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: resource
      path: "resources/meetings/{name}.md"
      index: true
```

**Note**: process-meetings also writes to person files and memory — those are workflow behaviors, not output types. The integration profile captures the primary output (meeting files) and indexing instruction.

---

## 9. rapid-context-dump

**Existing frontmatter**: No `creates_project` or `project_template`

**Current prose** (line ~310):
```
After all files are saved (draft or promoted), run `arete index` to make the context immediately searchable by brief, meeting-prep, and other skills.
```

**Proposed integration profile**:
```yaml
integration:
  outputs:
    - type: resource
      path: "context/{name}.md"
      index: true
```

**Note**: rapid-context-dump can save to multiple locations (context/, resources/, projects/) depending on what's being dumped. The profile captures the most common output path. The generated section should be general enough to cover "save to appropriate workspace location and index."

---

## Schema Gaps Identified

1. **save-meeting index.md update**: The skill updates `resources/meetings/index.md` in addition to saving the meeting file. The integration profile doesn't have a concept of "update an index file." This is acceptable — the index update is a workflow step in the SKILL.md body, not an integration hook behavior.

2. **rapid-context-dump multi-location output**: This skill can save to context/, resources/, or projects/ depending on content type. A single output path pattern doesn't capture this. The generated integration section should use general language ("save to appropriate workspace location") rather than a specific path for this skill. This is a minor expressiveness gap but doesn't require schema expansion — the `path` field is optional and can be omitted.

3. **process-meetings side effects**: This skill writes to person files, meeting frontmatter, and memory items in addition to its primary output. These are workflow behaviors, not output locations. The integration profile correctly captures only the primary output + indexing.

**Verdict**: No schema expansion needed. All 9 skills can be expressed with the proposed schema. Gaps are minor and relate to workflow steps that belong in the SKILL.md body, not integration hooks.
