# People

Track the people you work with: colleagues, customers, and product users. Each category has its own folder and a README with guidance.

## Categories

- **[Internal](internal/README.md)** — Colleagues, teammates, and internal stakeholders
- **[Customers](customers/README.md)** — Key accounts, buyers, and customer contacts
- **[Users](users/README.md)** — Product users and end users you learn from

## Quick Start

1. Create a person file: `people/<category>/<slug>.md` (e.g. `people/internal/jane-doe.md`).
2. Add YAML frontmatter: `name`, `email`, `role`, `company` or `team`, `category`.
3. Use the template in `templates/inputs/person.md` or copy from an existing person file.
4. Run `arete people list` to see everyone; `arete people index` to regenerate the table in `people/index.md`.

## Linking to Meetings and Projects

- **Meetings**: Add `attendee_ids: [slug]` in meeting frontmatter to link attendees to person pages.
- **Projects**: Add `stakeholders: [slug]` in project README or frontmatter to link key contacts.
