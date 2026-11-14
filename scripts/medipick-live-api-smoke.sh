#!/usr/bin/env bash
# MEDIPICK production anonymous API smoke — GET only, never sign in, mutate DB or read secrets.
set -Eeuo pipefail
BASE="${MEDIPICK_LIVE_BASE:-https://medipick.lexid.site}"
case "$BASE" in
  https://medipick.lexid.site|https://medipick-lexid.vercel.app) ;;
  *) echo "Refusing unknown deployment origin"; exit 2 ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
checks=0

get_json() {
  local label="$1" path="$2" expected="$3" filter="$4"
  local dest="$TMP/response.json" status
  status="$(curl --silent --show-error --location --max-time 22 --retry 2 --retry-delay 2 --output "$dest" --write-out '%{http_code}' "$BASE$path")"
  if [ "$status" != "$expected" ]; then
    echo "FAIL: $label HTTP $status (expected $expected)"; exit 1
  fi
  if ! jq -e "$filter" "$dest" >/dev/null 2>&1; then
    echo "FAIL: $label response shape/safety mismatch"; exit 1
  fi
  checks=$((checks+1))
  echo "PASS: $label (HTTP $status)"
}

# Public contracts, safe pre-production and production; zero side effects.
get_json "service endpoint" "/api/health" 200 '.ok==true and .service=="medipick"'
get_json "public hospital catalog summary" "/api/public-catalog/stats" 200 '(.total|type)=="number" and (.exact_mappable|type)=="number" and (.estimated_mappable|type)=="number" and .total >= .exact_mappable'
get_json "public hospital name/region search" "/api/public-catalog/search?q=%EC%84%9C%EC%9A%B8&limit=3" 200 '(.items|type)=="array" and (.items|length)<=3'
get_json "verified-only neighborhood search" "/api/public-catalog/nearby?lat=37.49&lon=127.12&radius=2&limit=5" 200 '(.items|type)=="array" and all(.items[]; .geocode_status=="exact")'
get_json "no member session" "/api/account/session" 200 '.authenticated==false and (has("user")|not)'
get_json "no administrator session" "/api/admin/me" 200 '.authenticated==false'
get_json "anonymous cannot read administrator stats" "/api/admin/stats" 401 '.error|type=="string"'
get_json "unavailable health record connector disclosed" "/api/health-data/connection" 200 '.connected==false and .storable_health_data==false'

echo "READ_ONLY_LIVE_API_SMOKE_PASS $checks/8"
