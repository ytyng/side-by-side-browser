#!/usr/bin/env bash
# Bump the version, push it, then trigger and watch the Release workflow.
# Invoked by `pnpm release [patch|minor|major]` (default: patch).
#
# Flow:
#   1. Verify the working tree is clean and HEAD == origin/main
#   2. Compute the next version from package.json
#   3. Rewrite the version, commit, and push
#   4. Trigger release.yml and watch it to completion
#
# The version has to move on every release: the workflow tags the release
# `v<version>`, and `gh release create` fails outright if that tag already has a
# release. Automating the bump removes the "forgot to bump" failure mode.
#
# Requires an authenticated gh CLI.
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
case "${BUMP}" in
  patch | minor | major) ;;
  *)
    echo "Usage: pnpm release [patch|minor|major]  (default: patch)" >&2
    exit 1
    ;;
esac

# Check gh before anything is rewritten. If gh turned out to be unusable after the
# push, the bump commit would sit on main with no workflow run behind it, and the
# next release would skip that version entirely.
if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI not found. Install it and run 'gh auth login'." >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run 'gh auth login'." >&2
  exit 1
fi

# Only number a release from a clean main. The build runs against origin/main, so a
# dirty or out-of-sync tree would ship something other than what was reviewed.
if [ "$(git branch --show-current)" != "main" ]; then
  echo "Error: not on the 'main' branch. Switch to main first." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree is not clean. Commit or stash your changes first." >&2
  exit 1
fi
git fetch origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "Error: local HEAD does not match origin/main. Push (or pull) first." >&2
  exit 1
fi

# Read the current version and compute the next one. Validate the whole string with a
# regex rather than per-part Number checks: Number.isNaN(undefined) is false, so "1.2"
# would otherwise slip through as a valid version.
CURRENT=$(node -p "require('./package.json').version")
VERSION=$(node -e '
  const cur = process.argv[1];
  const bump = process.argv[2];
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(cur)) {
    console.error("Error: current version is not X.Y.Z: " + cur);
    process.exit(1);
  }
  const [maj, min, pat] = cur.split(".").map(Number);
  const next = bump === "major" ? [maj + 1, 0, 0]
    : bump === "minor" ? [maj, min + 1, 0]
    : [maj, min, pat + 1];
  process.stdout.write(next.join("."));
' "${CURRENT}" "${BUMP}")

echo "Bumping version: ${CURRENT} -> ${VERSION} (${BUMP})"

# Replace only the version string instead of reserializing the JSON, so the file's
# formatting and key order survive. The regex swaps the first "version": "<old>" match;
# in package.json the top-level version is the first such key, so that is the one hit.
# Parsing first is what reads the current value to build that match.
node -e '
  const fs = require("fs");
  const version = process.argv[1];
  const file = "package.json";
  const text = fs.readFileSync(file, "utf8");
  const old = JSON.parse(text).version;
  if (typeof old !== "string") {
    throw new Error("no top-level string version in " + file);
  }
  const esc = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const needle = new RegExp("(\"version\"\\s*:\\s*\")" + esc + "(\")");
  const out = text.replace(needle, "$1" + version + "$2");
  if (out === text) throw new Error("version not replaced in " + file);
  fs.writeFileSync(file, out);
' "${VERSION}"

git add package.json
git commit -m "chore: release v${VERSION}"
if ! git push origin HEAD:main; then
  echo "Error: push failed. The local release commit remains." >&2
  echo "  Undo it:  git reset --hard origin/main" >&2
  echo "  Or retry: git push origin HEAD:main" >&2
  exit 1
fi

echo "Triggering release build for v${VERSION} ..."

# workflow_dispatch does not return a run ID, so remember the newest run beforehand and
# poll until a different one shows up.
PREV_RUN_ID=$(gh run list --workflow=release.yml --branch main --limit 1 \
  --json databaseId --jq '.[0].databaseId // ""')

gh workflow run release.yml --ref main

RUN_ID=""
for _ in $(seq 1 15); do
  sleep 2
  RUN_ID=$(gh run list --workflow=release.yml --branch main --limit 1 \
    --json databaseId --jq '.[0].databaseId // ""')
  if [ -n "${RUN_ID}" ] && [ "${RUN_ID}" != "${PREV_RUN_ID}" ]; then
    break
  fi
  RUN_ID=""
done
if [ -z "${RUN_ID}" ]; then
  echo "Error: could not find the triggered workflow run." >&2
  exit 1
fi
echo "Watching run ${RUN_ID} ..."
gh run watch "${RUN_ID}" --exit-status

echo "Done: https://github.com/ytyng/side-by-side-browser/releases/tag/v${VERSION}"
