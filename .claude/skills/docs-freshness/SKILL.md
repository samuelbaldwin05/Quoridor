---
name: docs-freshness
description: Use after any change that makes something in docs/ (ARCHITECTURE, INFRASTRUCTURE, BACKLOG, DECISIONS) stale, or when asked to check or refresh doc freshness. Covers how docs/manifest.json and scripts/docs_manifest.py track staleness and when to write to BACKLOG versus DECISIONS.
---

# Docs freshness

`docs/` has four reference docs, each pointed at by `CLAUDE.md`: `ARCHITECTURE.md`, `INFRASTRUCTURE.md`, `BACKLOG.md`, `DECISIONS.md`. Freshness of the first two is machine-tracked; the other two are open-ended by nature and tracked by judgment.

## How tracking works

Each doc's YAML frontmatter has two hand-authored fields, parsed by `scripts/docs_manifest.py`:

- `covers`: a list of repo paths the doc describes (for example `ARCHITECTURE.md` has `covers: [backend/app, frontend/src/engine, supabase/migrations]`).
- `reviewed_at`: the short git commit hash the doc was last verified accurate against (for example `reviewed_at: 0e3abee`).

Everything else in `docs/manifest.json` is derived, not authored: `content_sha` (hash of the doc file itself), `last_edit_commit` / `last_edit_date` (from `git log` on the doc file), and `stale` / `unreviewed_code_commits`. Staleness is computed only when a doc has both a non-empty `covers` and a `reviewed_at` set: the script runs `git log --format=%h {reviewed_at}..HEAD -- {covers paths}`, and if that returns any commits, the doc is marked `stale: true` with the list of `unreviewed_code_commits`.

`BACKLOG.md` and `DECISIONS.md` both have `covers: []` in their frontmatter, so they are never auto-flagged stale; their `stale` field is `null` in the manifest. Nothing forces you to notice they're out of date; that's a judgment call each time you touch the areas they describe.

## Running the check

`make docs-check` runs `python scripts/docs_manifest.py`, which regenerates `docs/manifest.json` and prints a summary. It lists each stale doc with its unreviewed commit count and a short preview of the commits, then tells you to reread it against its covered code and bump `reviewed_at`. The script only exits non-zero with the `--strict` flag; `make docs-check` invokes it without that flag, so it will not fail your local run, only report.

## After a change that touches covered code

1. Run `make docs-check` to see if `ARCHITECTURE.md` or `INFRASTRUCTURE.md` is now stale relative to what you changed.
2. If it is (or if you know your change makes a specific claim in one of those docs wrong even before the next commit lands), reread the relevant section against the current code, and edit the doc to match.
3. Bump that doc's `reviewed_at` frontmatter field to the commit you actually verified it against; only do this after really rereading it, not reflexively. `scripts/docs_manifest.py`'s own header comment is explicit about this: "Bump reviewed_at only after actually rereading a doc against its covered code."
4. Re-run `make docs-check` to confirm the doc no longer shows as stale.

## BACKLOG versus DECISIONS

- `BACKLOG.md`: open work only. Bugs, TODOs, planned features, deferred UX fixes. Tagged by severity (`[CRIT] [HIGH] [MED] [LOW]`), with a `path` reference to where in the code it applies. If your change reveals a new problem you're not fixing now, or leaves a known gap, add it here.
- `DECISIONS.md`: settled choices and their reasoning, plus explicit deferrals, so they are not re-litigated or rediscovered as "missing." It is append-only in spirit: "when a decision is reversed, add a new entry rather than editing the old one." If your change makes a real architectural or convention choice (not just an open TODO), record it here with the "why," not just the "what." Check this file before proposing something that might already have been decided against; it exists specifically so that doesn't happen.

If in doubt which one: BACKLOG is a to-do list, DECISIONS is a decision log. A line that starts "we should eventually..." belongs in BACKLOG; a line that starts "we chose X over Y because..." belongs in DECISIONS.
