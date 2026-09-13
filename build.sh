#!/bin/sh
# Builds the Chrome Web Store upload: dist/ozublocks-<version>.zip
set -e
cd "$(dirname "$0")"

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
out="dist/ozublocks-$version.zip"

mkdir -p dist
rm -f "$out"
zip -r -X -q "$out" manifest.json popup.html popup.css popup.js icons -x "*.DS_Store"

echo "$out"
unzip -l "$out"
