#!/usr/bin/env bash
# Runs the browser test page in headless Chrome. Needs python3 and google-chrome.
set -euo pipefail
cd "$(dirname "$0")"
PORT=${PORT:-8765}
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 0.5
OUT=$(google-chrome --headless=new --disable-gpu --no-sandbox --virtual-time-budget=5000 \
  --dump-dom "http://127.0.0.1:$PORT/tests/index.html" 2>/dev/null)
echo "$OUT" | sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/.*<pre id="out">//; s/<\/pre>.*//; s/&gt;/>/g; s/&lt;/</g; s/&amp;/\&/g'
echo "$OUT" | grep -q '<title>PASS</title>'
