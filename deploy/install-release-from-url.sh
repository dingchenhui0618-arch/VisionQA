#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_URL:?set RELEASE_URL to the short-lived private artifact URL}"
: "${RELEASE_SHA256:?set RELEASE_SHA256 to the expected artifact SHA-256}"

ROOT="${VISIONQA_ROOT:-/www/wwwroot/visionqa.dionysusding.cn}"
STAMP="${VISIONQA_RELEASE_STAMP:-$(date -u +%Y%m%d-%H%M%S)}"
ARCHIVE="/tmp/visionqa-release-${STAMP}.tar.gz"
REL="$ROOT/releases/$STAMP"

cleanup() { rm -f "$ARCHIVE"; }
trap cleanup EXIT

umask 077
curl --fail --location --silent --show-error "$RELEASE_URL" --output "$ARCHIVE"
printf '%s  %s\n' "$RELEASE_SHA256" "$ARCHIVE" | sha256sum --check --status

sudo mkdir -p "$REL"
sudo tar -xzf "$ARCHIVE" -C "$REL"
sudo chown -R www:www "$REL"
sudo -u www env PATH=/opt/node-v22.23.1/bin:$PATH npm_config_cache=/tmp/visionqa-npm-cache \
  bash -lc "cd '$REL' && /opt/node-v22.23.1/bin/npm ci"

sudo ln -s "$REL" "$ROOT/.current-$STAMP"
sudo mv -Tf "$ROOT/.current-$STAMP" "$ROOT/current"
sudo systemctl daemon-reload
sudo systemctl reset-failed visionqa-demo.service || true
sudo systemctl restart visionqa-demo.service
sleep 5
sudo systemctl show -p ActiveState,SubState,MainPID visionqa-demo.service
curl --fail --silent --show-error http://127.0.0.1:3210/api/health
