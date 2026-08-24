#!/usr/bin/env sh
# Fetches the two libraries that run the downloaded models, and checks them.
# Run this once after you clone. The build script runs it for you if you forget.
#
# The files are not kept in this repository. They are large, they are not our
# code, and one of them upsets automatic secret scanners. Pinned versions and
# checksums below make sure you always get exactly the same files.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/src/vendor"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

transformers=4.2.0
onnx=1.26.0-dev.20260416-b7804b056c
pico=2.1.1

sums="0a96dcf4c48981b7d05f53827e6975ec239132606ad0d526bbc2db0fcdbc4ded  $out/transformers.js
522b3769929f5684c83a12cf1e06eedf073b65d161728b4f3757c75d62b14384  $out/ort-wasm-simd-threaded.jsep.mjs
ae61141f8fbf0a4e43fd7b4f4d40a1a115627f6facc4f33ddf84074a655e33ea  $out/ort-wasm-simd-threaded.jsep.wasm
61207a40ffc02a42d1e50143651c121beab70ed413c934c1ff84fa263ba436b0  $out/pico.classless.min.css"

if [ "${1:-}" != "--force" ] && printf '%s\n' "$sums" | sha256sum -c --status 2>/dev/null; then
  echo "The libraries are already here and unchanged."
  exit 0
fi

mkdir -p "$out"
echo "Fetching Transformers.js $transformers, ONNX Runtime Web $onnx, and Pico.css $pico…"

curl -fsSL "https://registry.npmjs.org/@huggingface/transformers/-/transformers-$transformers.tgz" -o "$work/t.tgz"
curl -fsSL "https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-$onnx.tgz" -o "$work/o.tgz"
curl -fsSL "https://registry.npmjs.org/@picocss/pico/-/pico-$pico.tgz" -o "$work/p.tgz"
tar xzf "$work/t.tgz" -C "$work"
mv "$work/package" "$work/transformers"
tar xzf "$work/o.tgz" -C "$work"
mkdir "$work/pico" && tar xzf "$work/p.tgz" -C "$work/pico"

cp "$work/transformers/dist/transformers.web.min.js" "$out/transformers.js"
cp "$work/package/dist/ort-wasm-simd-threaded.jsep.mjs" "$out/"
cp "$work/package/dist/ort-wasm-simd-threaded.jsep.wasm" "$out/"
cp "$work/pico/package/css/pico.classless.min.css" "$out/"
cp "$work/pico/package/LICENSE.md" "$out/LICENSE-pico.txt"
cp "$work/transformers/LICENSE" "$out/LICENSE-transformers.txt"
curl -fsSL https://raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE -o "$out/LICENSE-onnxruntime.txt"

cat > "$out/README.txt" <<TXT
Transformers.js $transformers (Apache-2.0), from the npm package @huggingface/transformers
ONNX Runtime Web $onnx (MIT), from the npm package onnxruntime-web
Pico.css $pico (MIT), from the npm package @picocss/pico

Both files are unchanged copies. They ship inside the add-on because add-on
stores do not allow code loaded from the internet. Run vendor.sh to fetch them.
TXT

printf '%s\n' "$sums" | sha256sum -c --status || { echo "The files do not match the expected checksums. Nothing was installed."; rm -rf "$out"; exit 1; }
echo "Done. The libraries are in src/vendor."
