#!/bin/sh
# Headless agent Chrome for test runs: a copy of the agent profile (its JobTeaser / Gmail sessions), invisible, port 9224.
# Run tests with CDP_ENDPOINT=http://127.0.0.1:9224. Re-run this script after logging in again in the visible agent Chrome.
SRC="$HOME/.agent-profile"; DST="$HOME/.agent-profile-headless"
pkill -f "user-data-dir=$DST" 2>/dev/null; sleep 1
rsync -a --delete --exclude 'Singleton*' --exclude '*Cache*' --exclude 'Service Worker' "$SRC/" "$DST/"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$DST" --remote-debugging-port=9224 --window-size=1366,900 about:blank >/dev/null 2>&1 &
