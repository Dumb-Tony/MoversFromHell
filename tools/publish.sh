#!/usr/bin/env bash
# =============================================================================
# publish.sh — push the current build and confirm the public URL serves it.
# =============================================================================
#
#   ./tools/publish.sh
#
#   -> https://dumb-tony.github.io/MoversFromHell/
#
# PUSH IS THE DEPLOY. The repo is public, index.html is at the root, and Pages
# serves `main` at `/`. There is no build step and no second repo — `git push`
# publishes. Enabled once with:
#   gh api -X POST repos/Dumb-Tony/MoversFromHell/pages \
#          -f source[branch]=main -f source[path]=/
#
# Copied from Dev\BedroomRacers\tools\publish.sh (Dev\INDEX.md -> Publishing).
# The polling loop and both of its warnings are that file's, kept verbatim in
# spirit because they were paid for. TWO differences, both because that project
# publishes ONE bundled file into a separate repo and this one publishes a tree
# from its own repo:
#
#   1. No build and no copy. This script pushes the repo it lives in.
#   2. It verifies SEVERAL files, not just index.html. A multi-file site can
#      serve a current index.html while the ES modules beside it are still the
#      previous build — index.html barely changes between phases, so hashing it
#      alone would have happily declared a stale deploy live.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="https://dumb-tony.github.io/MoversFromHell/"
REPO="Dumb-Tony/MoversFromHell"

# Files whose content proves WHICH build is live. index.html is nearly static
# between phases, so config.js (it carries BUILD.label) and main.js (the entry
# that pulls in every module) are what actually distinguish one build from the
# next. Add to this list, never shrink it.
VERIFY_PATHS=(
  "index.html"
  "src/config.js"
  "src/main.js"
)

cd "$ROOT" || exit 2

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || { echo "on branch '$branch', not main — refusing to publish" >&2; exit 2; }

if [ -n "$(git status --porcelain)" ]; then
  echo "working tree is dirty — commit before publishing:" >&2
  git status --short >&2
  exit 2
fi

# Push only if there is something to push; either way we still verify the live
# URL, because "my commit is pushed" and "the link a friend opens is current"
# are different claims and only the second one matters.
if [ -n "$(git log origin/main..HEAD --oneline 2>/dev/null)" ]; then
  git push -q origin main || { echo "push failed" >&2; exit 1; }
  echo "pushed $(git rev-parse --short HEAD). Waiting for GitHub Pages…"
else
  echo "nothing new to push — checking the live link is serving this build"
fi

# ── WAIT FOR THE URL TO SERVE THIS BUILD ─────────────────────────────────────
# Poll the CONTENT, not the build API. Two ways the API misleads, both observed
# on BedroomRacers:
#
#   1. `pages/builds/latest` describes the PREVIOUS build for a while after a
#      push, so "status == built" reports success against the build before
#      yours. That happened: the check went green while the site was still
#      serving a bundle with no touch controls in it.
#   2. It also goes stale the other way — it sat on an older commit long after
#      the new content was live, so waiting for the sha to appear times out on
#      a deploy that already worked.
#
# What the URL actually returns settles both. Compared by git's own content
# hash rather than by byte count, because the working copy here has CRLF line
# endings while git stores and serves LF — a byte comparison is off by one per
# line and can never match. The first version of this check reported 473,664
# against 463,193 and called a perfectly good deploy a failure.
command -v curl >/dev/null 2>&1 || { echo "curl not found; cannot verify"; echo "$URL"; exit 0; }

head_sha="$(git rev-parse HEAD)"
for i in $(seq 1 24); do
  all_match=1
  stale=""
  for p in "${VERIFY_PATHS[@]}"; do
    want="$(git rev-parse "HEAD:$p")"
    live="$(curl -sS "${URL}${p}?cb=${head_sha}-${i}" 2>/dev/null | git hash-object --stdin)"
    if [ "$live" != "$want" ]; then
      all_match=0
      stale="$p (want ${want:0:12}, serving ${live:0:12})"
      break
    fi
  done

  if [ "$all_match" = "1" ]; then
    echo "live and serving this exact build (${#VERIFY_PATHS[@]} files verified by blob hash)"
    echo "$URL"
    exit 0
  fi

  # Surface a genuine build failure rather than waiting out the clock. This is
  # the ONLY thing the API is trusted for.
  if command -v gh >/dev/null 2>&1; then
    st="$(gh api "repos/$REPO/pages/builds/latest" --jq '.status' 2>/dev/null)"
    [ "$st" = "errored" ] && { echo "Pages build FAILED" >&2; exit 1; }
  fi
  sleep 10
done

echo "four minutes on and the URL is still serving an old build" >&2
echo "  stale: $stale" >&2
echo "  $URL" >&2
exit 1
