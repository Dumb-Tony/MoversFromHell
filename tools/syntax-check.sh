#!/usr/bin/env bash
# Syntax-gate every source file, AS A MODULE. ~40 ms per file against ~90 seconds to
# discover the same typo as a blank page and an error banner in headless Chrome.
#
# ⚠ WHY THE .mjs COPY, AND WHY `node --check src/foo.js` IS NOT ENOUGH.
#
# `node --check` parses a .js file with the COMMONJS goal. Module syntax is not valid
# CommonJS, and rather than rejecting it, the check exits 0. MEASURED on 2026-08-23 with
# Node v24.18.1: a file containing
#
#     import {
#     import {
#       a,
#     } from './x.js';
#
# — a real breakage, produced by splicing an import into the middle of another one —
# passed `node --check broken.js` with exit 0, and failed `node --check broken.mjs` with
# "SyntaxError: Unexpected reserved word". The whole of src/ is ES modules, so the cheap
# gate had a blind spot shaped exactly like the code it was guarding.
#
# `--input-type=module` does not help: it is rejected outright when the input is a file
# (ERR_INPUT_TYPE_NOT_ALLOWED). Copying to a .mjs extension is what actually sets the goal.
#
#   ./tools/syntax-check.sh              every .js under src/ and tools/
#   ./tools/syntax-check.sh src/main.js  just these
set -u
cd "$(dirname "$0")/.." || exit 2

if ! command -v node >/dev/null 2>&1; then
  echo "node not found — skipping the syntax gate (the browser suites are the real check)"
  exit 0
fi

files=("$@")
if [ ${#files[@]} -eq 0 ]; then
  while IFS= read -r f; do files+=("$f"); done < <(find src tools -name '*.js' | sort)
fi

tmp="${TMPDIR:-/tmp}/_syntax_check_$$.mjs"
bad=0
for f in "${files[@]}"; do
  cp "$f" "$tmp" || continue
  if ! err=$(node --check "$tmp" 2>&1); then
    echo "SYNTAX  $f"
    echo "$err" | sed -n '2,5p'
    bad=$((bad + 1))
  fi
done
rm -f "$tmp"

echo "checked ${#files[@]} file(s); ${bad} with syntax errors"
[ "$bad" -eq 0 ]
