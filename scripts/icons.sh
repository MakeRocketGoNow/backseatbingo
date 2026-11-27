#!/usr/bin/env sh
# Regenerates the PNG icons from the SVG sources. Needs rsvg-convert (librsvg).
set -eu
cd "$(dirname "$0")/../public/icons"
# Browser tabs do not round the favicon, so it gets the same corner radius as the home page logo.
sed -e 's|<rect width="2048" height="2048"|& rx="475"|' \
    -e 's|App icon: the shield-B logo on a full-bleed violet tile; the OS rounds the corners.|Favicon: generated from icon.svg by scripts/icons.sh, with corners rounded like the home page logo.|' \
    icon.svg > favicon.svg
rsvg-convert -w 192 -h 192 icon.svg > icon-192.png
rsvg-convert -w 512 -h 512 icon.svg > icon-512.png
rsvg-convert -w 512 -h 512 icon-maskable.svg > icon-maskable-512.png
# Apple ignores the manifest and wants an opaque 180px icon.
rsvg-convert -w 180 -h 180 icon-maskable.svg > apple-touch-icon.png
