#!/usr/bin/env bash
set -euo pipefail
# QA evidence only: unsigned Simulator app, NOT an App Store installation package.
APP_PATH="$(find "$HOME/Library/Developer/Xcode/DerivedData" -path '*/Build/Products/Debug-iphonesimulator/MEDIPICKiOS.app' -type d -print -quit)"
test -d "$APP_PATH"
SCREEN_DIR="${RUNNER_TEMP:?}/medipick-ios-screenshots"
mkdir -p "$SCREEN_DIR"

IDS_OUTPUT="$(xcrun simctl list devices available -j | python3 -c '
import json, sys
data=json.load(sys.stdin)["devices"]
for runtime in sorted(data):
    if "iOS" not in runtime:
        continue
    phones=[d for d in data[runtime] if d.get("isAvailable") and "iPhone" in d["name"]]
    pads=[d for d in data[runtime] if d.get("isAvailable") and "iPad" in d["name"]]
    if not phones or not pads: continue
    def choose(items, names):
        for n in names:
            for d in items:
                if d["name"]==n: return d["udid"]
        return items[0]["udid"]
    print(choose(phones, ["iPhone 17 Pro Max", "iPhone 16 Pro Max"]))
    print(choose(pads, ["iPad Pro 13-inch (M5)", "iPad Pro 13-inch (M4)"]))
    break
')"
PHONE_ID="$(printf '%s\n' "$IDS_OUTPUT" | sed -n '1p')"
PAD_ID="$(printf '%s\n' "$IDS_OUTPUT" | sed -n '2p')"
if [[ -z "$PHONE_ID" || -z "$PAD_ID" ]]; then
  echo "No iPhone + iPad simulator pair: cannot produce genuine screenshots" >&2
  exit 1
fi

capture() {
  local udid="$1" kind="$2" output="$SCREEN_DIR/$2.png"
  xcrun simctl boot "$udid" || true
  xcrun simctl bootstatus "$udid" -b
  xcrun simctl ui "$udid" appearance light
  xcrun simctl status_bar "$udid" override --time '9:41' --batteryState charged --batteryLevel 100 || true
  xcrun simctl install "$udid" "$APP_PATH"
  xcrun simctl launch "$udid" site.lexid.medipick
  sleep 9
  xcrun simctl io "$udid" screenshot "$output"
  test -s "$output"
  sips -g pixelWidth -g pixelHeight "$output"
  if [[ $(stat -f %z "$output") -lt 20000 ]]; then
    echo "QA screenshot too small: $output" >&2
    exit 1
  fi
  xcrun simctl shutdown "$udid"
}
capture "$PHONE_ID" iphone_home
capture "$PAD_ID" ipad_home
cat > "$SCREEN_DIR/QA_README.txt" <<'EOF'
Real Simulator captures after launching unsigned MEDIPICKiOS app.
For QA only, NOT approved App Store marketing screenshots.
Review screenshot pixels and API content manually.
No physical iPhone install, code signing or TestFlight has occurred.
EOF
test "$(find "$SCREEN_DIR" -name '*.png' | wc -l | tr -d ' ')" -eq 2
