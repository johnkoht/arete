# Scratchpad

Quick capture for build ideas, questions, and TODOs. Review periodically; move mature items to `dev/backlog/` or turn into PRDs.

---

## Ideas

- **Can Areté use [find-skills](https://skills.sh/vercel-labs/skills/find-skills) to find and recommend skills when a user is trying to accomplish something that is not built in?** — The Skills CLI (`npx skills find [query]`) lets users search the open agent skills ecosystem. When the router returns no match (or the user's intent isn't covered by a default skill), Areté could run `npx skills find <query>` and suggest installable skills (e.g. `npx skills add vercel-labs/skills@find-skills`). Explore: integrate find-skills workflow into skill routing / "no match" path, or add a dedicated "suggest skills" step in GUIDE mode.

## TODOs

## Notes

---
