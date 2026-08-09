#!/usr/bin/env python3
# Regenerates docs/manifest.json, a freshness index for the docs/ files.
#
# Only two fields per doc are authored by hand, in each doc's YAML frontmatter:
#   covers      - repo paths the doc describes; staleness is measured against these
#   reviewed_at - the commit the doc was last verified accurate against
# Everything else (last edit, content hash, staleness verdict) is derived from git,
# so the manifest cannot drift from reality. Bump reviewed_at only after actually
# rereading a doc against its covered code. Run via `make docs-check`.
#
# Frontmatter is parsed as a small controlled subset (title, reviewed_at scalars and a
# covers list), not full YAML, to avoid a dependency.

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
MANIFEST = DOCS / "manifest.json"


def git(*args: str) -> str:
    res = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True)
    return res.stdout.strip()


def parse_frontmatter(text: str) -> dict:
    meta = {"title": None, "covers": [], "reviewed_at": None}
    if not text.startswith("---"):
        return meta
    end = text.find("\n---", 3)
    if end == -1:
        return meta
    current_list = None
    for raw in text[3:end].splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        stripped = line.strip()
        if stripped.startswith("- ") and current_list is not None:
            meta[current_list].append(stripped[2:].strip())
            continue
        if ":" in line:
            key, _, val = line.partition(":")
            key, val = key.strip(), val.strip()
            if key == "covers":
                meta["covers"] = []
                current_list = "covers"
            elif key in ("title", "reviewed_at"):
                meta[key] = val or None
                current_list = None
    return meta


def doc_entry(path: Path) -> tuple[str, dict]:
    rel = path.relative_to(REPO).as_posix()
    meta = parse_frontmatter(path.read_text(encoding="utf-8"))
    last = git("log", "-1", "--format=%h|%ad", "--date=short", "--", rel)
    last_commit, _, last_date = last.partition("|")
    entry = {
        "title": meta["title"],
        "reviewed_at": meta["reviewed_at"],
        "covers": meta["covers"],
        "content_sha": (git("hash-object", str(path))[:12] or None),
        "last_edit_commit": last_commit or None,
        "last_edit_date": last_date or None,
        "stale": None,
        "unreviewed_code_commits": [],
    }
    if meta["covers"] and meta["reviewed_at"]:
        out = git("log", "--format=%h", f"{meta['reviewed_at']}..HEAD", "--", *meta["covers"])
        commits = [c for c in out.splitlines() if c]
        entry["stale"] = bool(commits)
        entry["unreviewed_code_commits"] = commits
    return rel, entry


def main() -> None:
    strict = "--strict" in sys.argv
    docs = sorted(DOCS.glob("*.md"))
    manifest = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "head": git("rev-parse", "--short", "HEAD") or None,
        "docs": {},
    }
    stale: list[tuple[str, list[str]]] = []
    for path in docs:
        rel, entry = doc_entry(path)
        manifest["docs"][rel] = entry
        if entry["stale"]:
            stale.append((rel, entry["unreviewed_code_commits"]))

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {MANIFEST.relative_to(REPO).as_posix()} ({len(docs)} docs).")
    if stale:
        print("\nSTALE (covered code changed since reviewed_at):")
        for rel, commits in stale:
            preview = " ".join(commits[:6])
            print(f"  {rel}: {len(commits)} unreviewed commit(s): {preview}")
        print("\nReread each against its covered code, then bump its reviewed_at.")
    else:
        print("All reference docs current.")
    if strict and stale:
        sys.exit(1)


if __name__ == "__main__":
    main()
