# project-exit Increment B — Claude Code settings snippet

Increment B ships two harness-facing surfaces: a statusline segment and a SessionStart hook. Neither is wired automatically — paste the block below into your `.claude/settings.json` to activate them. (The agent does NOT edit your live `settings.json`; this doc is the snippet to apply by hand.)

## Settings block

Merge this into `.claude/settings.json` (it is the user's live config — hand-edit, do not let tooling clobber unrelated keys):

```json
{
  "statusLine": {
    "type": "command",
    "command": "arete project statusline"
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "arete project session-start --json" }
        ]
      }
    ]
  }
}
```

## How the session-start verb reads `source`

Claude Code passes the SessionStart hook payload as JSON on stdin, including a `source` field (`startup` | `resume` | `clear`). The `arete project session-start` verb reads `source` from that stdin JSON when present and falls back to the `--source` flag (default `startup`) otherwise. You do NOT pass `--source` in the hook command — the stdin payload supplies it. The `--json` flag tells the verb to emit a Claude Code `hookSpecificOutput` envelope (`{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "..." } }`) so the stale-marker notice and resume greeting land in the agent's context; when there is nothing to say it emits `{}`.

Behavior by source: `startup` and `clear` wipe a stale active-project marker (with a notice if the prior session left unsaved work); only `startup` emits the once/day resume greeting. `resume` does neither (it preserves the open marker).

## Statusline latency caveat

`statusLine.command` is spawned by Claude Code on every prompt render. `arete project statusline` is a fresh Node process each time, so there is node-spawn startup latency (tens to low-hundreds of ms) on every render. This is acceptable for a statusline that updates between prompts, but be aware it is not free — if your shell prompt feels sluggish, the statusline spawn is the first thing to check. The verb is wrapped in a total error guard: on ANY failure it prints nothing (never a stray byte or stack trace into your prompt line), and it emits no trailing newline.

## Manual verification

1. `arete project mark-open <slug>` on a project in your workspace, then confirm `▸ <slug>` renders in the statusline.
2. Edit any file under `projects/active/<slug>/` (or the resume sidecar `.arete/sessions/<slug>.md`), then confirm the statusline flips to `▸ <slug> · unsaved` — the filesystem mtime backstop catches the edit even though the marker's `dirty` bit is still clean.
3. Restart Claude Code (fresh `startup`) with a recently-touched project that has a resume sidecar present, and confirm the greeting fires once that day on startup (`Welcome back. Pick up where you left off? \`/project <slug>\``). It is throttled to once per day via `.arete/sessions/.last-greeting`, so a second startup the same day stays silent.
