#!/usr/bin/env bash
# Build, package and publish the site to datajournal.org from this machine.
#
# The normal path is CI: every green push to main runs the `release` job in .github/workflows/ci.yml,
# which does exactly what this script does. This exists for the times that path is not available — a
# GitHub Actions outage, a runner that never gets acquired, or simply needing to ship before a run
# finishes. It is deliberately the same sequence, in the same order, with the same guards, so a manual
# release is not a different kind of release.
#
# The publishing contract (also pinned by tests/publish.spec.ts): datajournal.org serves each project
# straight out of the .tar.zst asset on its latest GitHub release. The server never builds or checks out
# anything. So the archive must hold index.html, meta.json and the preview image AT ITS ROOT, carry no
# hidden files, and keep every path under the classic ustar name limit — longer paths truncate silently
# and 404.
#
#   npm run release                 build, verify, ask, upload, ping the server
#   npm run release -- --dry-run    everything except the upload and the ping
#   npm run release -- --yes        skip the confirmation prompt (for a scripted run)
#   npm run release -- --skip-checks  skip `npm run check` (emergencies only — see below)
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DRY_RUN=0
ASSUME_YES=0
SKIP_CHECKS=0
for arg in "$@"; do
	case "$arg" in
	--dry-run) DRY_RUN=1 ;;
	--yes | -y) ASSUME_YES=1 ;;
	--skip-checks) SKIP_CHECKS=1 ;;
	*)
		echo "unknown option: $arg" >&2
		exit 2
		;;
	esac
done

say() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
die() {
	printf '\033[31m✗ %s\033[0m\n' "$1" >&2
	exit 1
}

# --- preconditions -------------------------------------------------------------------------------
command -v zstd >/dev/null || die "zstd is not installed (brew install zstd)"
command -v gh >/dev/null || die "the GitHub CLI is not installed (brew install gh)"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated — run: gh auth login"

# What CI can take for granted and a laptop cannot: that the thing being published is a commit someone
# can find again. Neither is fatal — shipping from a dirty tree during an outage is a legitimate
# reason to run this — but both have to be said out loud rather than discovered later.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || echo "⚠ on branch '$BRANCH', not main — CI only ever releases from main"
git diff --quiet && git diff --cached --quiet || echo "⚠ uncommitted changes — the release will not match any commit"

# --- the gate ------------------------------------------------------------------------------------
# The CI release job runs `needs: [checks, e2e]`, so nothing reaches the server without the full suite
# passing. Mirrored here rather than trusted to habit: this script's whole purpose is to be used when
# CI is not the thing gating the deploy.
if [ "$SKIP_CHECKS" -eq 1 ]; then
	echo "⚠ skipping npm run check — publishing code the suite has not verified"
else
	say "Running the full gate (npm run check) — this is what CI does before releasing"
	npm run check
fi

# --- build ---------------------------------------------------------------------------------------
# No VITE_SITE_URL override: the default IS https://datajournal.org, so canonical, hreflang and og:url
# point at the copy this publishes.
say "Building"
npm run build

# --- guard ---------------------------------------------------------------------------------------
say "Checking the archive constraints"
long="$(find build -type f | sed 's|^build/||' | awk 'length($0) > 95')"
[ -z "$long" ] || die "paths exceed the ustar limit:
$long"
for f in index.html meta.json og.jpg; do
	[ -f "build/$f" ] || die "build/$f missing from the archive root"
done
echo "  paths ok, archive-root files present"

# --- pack ----------------------------------------------------------------------------------------
# An explicit file list instead of --exclude='.*': GNU tar's unanchored exclude matches the leading `.`
# component of EVERY member under `-C build .`, which once shipped a perfectly valid, perfectly empty
# 22-byte archive. `find` names exactly the regular, non-hidden files — no pattern semantics to differ
# between tar flavours (and this script runs on macOS's bsdtar, CI's on GNU tar).
say "Packing release.tar.zst"
(cd build && find . -type f ! -name '.*' ! -path '*/.*' | LC_ALL=C sort | tar -cf - -T -) | zstd -9 >release.tar.zst

# --- verify --------------------------------------------------------------------------------------
# Trust nothing that has not been read back: decompress the actual artifact and assert it holds the
# site. The empty-archive failure above passed every earlier check, because nothing looked at the tar.
say "Verifying the archive"
listing="$(zstd -dc release.tar.zst | tar -tf -)"
count="$(echo "$listing" | wc -l | tr -d ' ')"
for f in ./index.html ./meta.json ./og.jpg; do
	echo "$listing" | grep -qx "$f" || die "$f missing from the archive"
done
[ "$count" -gt 20 ] || die "archive suspiciously small ($count entries)"
hidden="$(echo "$listing" | grep -E '(^|/)\.[^/]' || true)"
[ -z "$hidden" ] || die "hidden files in the archive:
$hidden"
echo "  $count entries, $(du -h release.tar.zst | cut -f1) compressed"

if [ "$DRY_RUN" -eq 1 ]; then
	say "Dry run — release.tar.zst is built and verified, nothing was uploaded"
	exit 0
fi

# --- confirm -------------------------------------------------------------------------------------
# The upload replaces what the public site serves, from a laptop, outside CI. Worth one keystroke.
if [ "$ASSUME_YES" -eq 0 ]; then
	echo
	echo "About to publish to https://datajournal.org/eclipse-2026/"
	echo "  repo    $(gh repo view --json nameWithOwner -q .nameWithOwner)"
	echo "  commit  $(git rev-parse --short HEAD) on $BRANCH"
	read -r -p "Upload and deploy? [y/N] " reply
	[ "$reply" = "y" ] || [ "$reply" = "Y" ] || die "aborted"
fi

# --- upload --------------------------------------------------------------------------------------
say "Uploading the release asset"
gh release create "release" --title "Release" --latest >/dev/null 2>&1 || true
gh release upload "release" --clobber release.tar.zst

# --- deploy --------------------------------------------------------------------------------------
# The server picks the asset up on its next restart anyway; the webhook just makes it immediate. The
# URL is a repository secret in CI, so locally it has to come from the environment.
say "Pinging the server"
if [ -z "${WEBHOOK_URL:-}" ]; then
	echo "⚠ WEBHOOK_URL not set — the asset is published, but the server was not pinged."
	echo "  It will pick the release up on its next restart, or run:"
	echo "     WEBHOOK_URL=… curl -fsS \"\$WEBHOOK_URL/update_pages\""
else
	curl -fsS "${WEBHOOK_URL}/update_pages"
	echo "  deployed"
fi

say "Done — https://datajournal.org/eclipse-2026/"
