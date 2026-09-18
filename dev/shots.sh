#!/usr/bin/env bash
# README 이미지 재생성. ffmpeg 가 필요하지만 결과물(docs/*.png, docs/demo.gif)은 커밋되므로
# 앱을 쓰거나 기여하는 데는 필요 없다.
set -euo pipefail
cd "$(dirname "$0")/.."

npx electron dev/shots.js

# palettegen/paletteuse 로 색 뭉침을 막는다. 픽셀아트라 확대·축소는 neighbor 로.
ffmpeg -y -loglevel error -framerate 12.5 -i docs/frames/f%04d.png \
  -vf "scale=iw/2:ih/2:flags=neighbor,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=none" \
  -loop 0 docs/demo.gif

rm -rf docs/frames
echo "✓ docs/demo.gif"
