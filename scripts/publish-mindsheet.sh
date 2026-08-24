#!/usr/bin/env bash
#
# Publish a @aivocado/mindsheet change and re-pin it here — in one step.
#
# WHY THIS EXISTS
#   @aivocado/mindsheet is a git dependency pinned by commit hash in
#   package.json (github:svedenieva/mindsheet#<hash>). Two traps bit us:
#     1. npm caches a git dep by name@version. If the internal package.json
#        version doesn't change, Vercel serves the STALE cached tarball even
#        after the hash moves — the "нихуя не поменялось" incident. So every
#        publish MUST bump the version.
#     2. mindsheet is SHARED WITH FATHOM. A change here can silently break
#        Fathom, and no CI guards that yet — test Fathom after publishing.
#
# WHAT IT DOES
#   1. bumps mindsheet's package.json version (patch) — changes the cache key
#   2. commits + pushes mindsheet (so the hash exists on GitHub)
#   3. re-pins package.json here to the new commit hash
#   4. npm install, to refresh package-lock with the new tarball
#
# USAGE
#   AI_RESEARCHER dir = repo root. mindsheet working copy defaults to
#   ../mindsheet; override with MINDSHEET_DIR.
#     ./scripts/publish-mindsheet.sh "fix: rounder badges"
#
set -euo pipefail

MSG="${1:-chore: publish mindsheet}"
MINDSHEET_DIR="${MINDSHEET_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/mindsheet}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

[ -d "$MINDSHEET_DIR/.git" ] || { echo "no mindsheet repo at $MINDSHEET_DIR (set MINDSHEET_DIR)"; exit 1; }

echo "→ mindsheet: $MINDSHEET_DIR"
cd "$MINDSHEET_DIR"

# 1. bump version (the npm cache key). --no-git-tag-version: we commit ourselves.
NEWVER="$(npm version patch --no-git-tag-version)"
echo "→ version bumped to $NEWVER"

# 2. commit everything currently staged/modified + the version bump, then push
git add -A
git commit -m "$MSG ($NEWVER)"
git push origin HEAD
HASH="$(git rev-parse HEAD)"
echo "→ pushed $HASH"

# 3. re-pin here (https form, never ssh — Vercel builds have no ssh key)
cd "$HERE"
node -e '
  const fs=require("fs"), p="package.json";
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  j.dependencies["@aivocado/mindsheet"]="github:svedenieva/mindsheet#"+process.argv[1];
  fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
' "$HASH"
echo "→ re-pinned package.json to #$HASH"

# 4. refresh the lockfile with the new tarball
npm install @aivocado/mindsheet
echo "→ package-lock updated"

echo
echo "DONE. Now:"
echo "  • git add package.json package-lock.json && commit + deploy here"
echo "  • ⚠️  test Fathom against the new mindsheet — it shares this package"
