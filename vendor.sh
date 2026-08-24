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

sums="e74bd32ed4453369ebb0edcaa27f6bc6204004a949a0233cdb87b62dda8d6978  $out/transformers.js
5f2cd914554830762579c372d0211614c1e3f40ab3f6c0cfcf0900343229071d  $out/ort-wasm-simd-threaded.mjs
f4f290847a4df02d0b93cdbf39b4b0e71acefbe80573e7e6b9342a7abd7b290a  $out/ort-wasm-simd-threaded.wasm
5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9  $out/ort-wasm-simd-threaded.asyncify.mjs
e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786  $out/ort-wasm-simd-threaded.asyncify.wasm
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

# The .web. builds leave ONNX Runtime as a bare import, which a browser cannot resolve.
# This one bundles everything, so the add-on needs nothing from the internet.
cp "$work/transformers/dist/transformers.min.js" "$out/transformers.js"
# Only the files this build of Transformers.js actually names. It never asks for
# the jsep or jspi variants, so shipping those would be dead weight.
for part in ort-wasm-simd-threaded.mjs ort-wasm-simd-threaded.wasm ort-wasm-simd-threaded.asyncify.mjs ort-wasm-simd-threaded.asyncify.wasm; do
  cp "$work/package/dist/$part" "$out/"
done
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
