#!/usr/bin/env bash
set -euo pipefail
out="${1:?usage: build-site.sh <output-dir>}"
rm -rf "$out"
mkdir -p "$out/media"
cp -r site/. "$out/"
cp docs/media/logo.png docs/media/screen-*.png docs/media/timeclaim-tour.mp4 "$out/media/"
cp public/favicon.ico public/apple-touch-icon.png public/icon-512.png "$out/media/"
