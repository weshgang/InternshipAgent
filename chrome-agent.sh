#!/bin/sh
# Fallback: dedicated Chrome profile with debugging port (required on Chrome 136+).
# Log in once to JobTeaser, LinkedIn, Gmail in this profile.
open -na "Google Chrome" --args --user-data-dir="$HOME/.agent-profile" --remote-debugging-port=9223
