#!/usr/bin/env sh
# Builds the two files you upload to the add-on stores.
# Use: ./build.sh            builds both
#      ./build.sh 1.2.0      sets the version first, then builds
set -eu
here=$(cd "$(dirname "$0")" && pwd)
dist="$here/dist"

if [ $# -gt 0 ]; then
  for file in "$here/src/manifest.json" "$here/platform/manifest.firefox.json"; do
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$1\"/" "$file"
  done
  echo "Version set to $1."
fi

sh "$here/vendor.sh"

# A wrong vendored bundle only shows up when a browser tries to load it, so check here.
if command -v node >/dev/null 2>&1; then
  node "$here/test/wiring.mjs" >/dev/null || { echo "The wiring checks failed. Run: node test/wiring.mjs"; exit 1; }
fi

version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$here/src/manifest.json" | head -1)
rm -rf "$dist" && mkdir -p "$dist/chrome" "$dist/firefox"

cp -r "$here/src/." "$dist/chrome/"
(cd "$dist/chrome" && zip -qr "$dist/tidy-tabs-chrome-$version.zip" . -x ".*")

cp -r "$here/src/." "$dist/firefox/"
cp "$here/platform/manifest.firefox.json" "$dist/firefox/manifest.json"
rm -rf "$dist/firefox/vendor" "$dist/firefox/offscreen.html" "$dist/firefox/offscreen.js"
(cd "$dist/firefox" && zip -qr "$dist/tidy-tabs-firefox-$version.zip" . -x ".*")

echo "Built version $version:"
ls -lh "$dist"/*.zip | awk '{print "  " $9 "  " $5}'
