#!/usr/bin/env sh
# Sets this project up for development and testing. Run it once.
# It puts everything under .tools, touches nothing else, and needs no admin rights.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tools="$here/.tools"
node_version=22.14.0

say() { printf '\n== %s\n' "$1"; }

say "Node"
if command -v node >/dev/null 2>&1 && [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -ge 20 ] 2>/dev/null; then
  echo "Using the Node already on your machine: $(node --version)."
  node_bin=$(dirname "$(command -v node)")
elif [ -x "$tools/node/bin/node" ]; then
  echo "Using the Node in .tools: $("$tools/node/bin/node" --version)."
  node_bin="$tools/node/bin"
else
  echo "Fetching Node $node_version into .tools…"
  mkdir -p "$tools"
  curl -fsSL "https://nodejs.org/dist/v$node_version/node-v$node_version-linux-x64.tar.xz" -o "$tools/node.tar.xz"
  tar xf "$tools/node.tar.xz" -C "$tools"
  mv "$tools/node-v$node_version-linux-x64" "$tools/node"
  rm "$tools/node.tar.xz"
  node_bin="$tools/node/bin"
fi
PATH="$node_bin:$PATH"
export PATH

say "A browser to test in"
browser=""
for candidate in "${CHROME:-}" chromium chromium-browser google-chrome google-chrome-stable brave-browser; do
  [ -n "$candidate" ] && command -v "$candidate" >/dev/null 2>&1 && { browser=$(command -v "$candidate"); break; }
done
if [ -n "$browser" ]; then
  echo "Found $browser."
else
  echo "No Chromium-like browser found."
  echo "Install one, for example: sudo apt install chromium"
  echo "Or set CHROME to the path of the browser you want to use."
fi

say "The driver that opens the browser"
if [ -d "$here/node_modules/puppeteer-core" ]; then
  echo "Already installed."
else
  echo "Installing puppeteer-core…"
  (cd "$here" && npm install --silent --no-audit --no-fund)
fi

say "The libraries the add-on ships"
sh "$here/vendor.sh"

cat > "$here/.tools/env.sh" <<ENV
# Load this to use the tools: . ./.tools/env.sh
export PATH="$node_bin:\$PATH"
export CHROME="${browser:-}"
ENV

say "Done"
echo "Load the tools into your shell with:"
echo "  . ./.tools/env.sh"
echo
echo "Then run:"
echo "  npm test        or  node test/all.mjs   — every check"
echo "  node test/browser.mjs                   — drives a real browser"
