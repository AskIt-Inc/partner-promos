#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STTT_ROOT="${STTT_ROOT:-/Users/sukhjindersingh/Sites/sttt}"
CONFIG_FILE="$PROJECT_ROOT/partner-configs.json"
INDEX_FILE="$PROJECT_ROOT/index.html"

run_sttt() {
  (cd "$STTT_ROOT" && ddev exec "$@")
}

session_uuid="$(jq -r '.registrationTrackingPilot.sessionUuid' "$CONFIG_FILE")"
tracked_url="$(jq -r '.registrationTrackingPilot.trackedUrl' "$CONFIG_FILE")"
fallback_url="$(jq -r '.registrationTrackingPilot.fallbackUrl' "$CONFIG_FILE")"
metadata="$(jq -r '[.registrationTrackingPilot.source, .registrationTrackingPilot.medium, .registrationTrackingPilot.campaign, .registrationTrackingPilot.placement] | join("|")' "$CONFIG_FILE")"

[[ "$session_uuid" == "075d0ed1-293d-43ae-9ab7-7402a7ca1696" ]] || { echo "Unexpected pilot session UUID: $session_uuid" >&2; exit 1; }
[[ "$tracked_url" == */r/* ]] || { echo "Tracked URL is not an STTT redirect URL." >&2; exit 1; }
[[ "$tracked_url" != "$fallback_url" ]] || { echo "Tracked URL must differ from the direct fallback." >&2; exit 1; }
[[ "$metadata" == "Promo Card|qr|facebook-promo-houston-methodist-2026-10-01-emotional-care|facebook-promo-registration-qr" ]] || { echo "Pilot metadata mismatch: $metadata" >&2; exit 1; }

rg -q 'getSessionRegistrationTrackingPilot' "$INDEX_FILE"
rg -q 'const displayUrl = trackingPilot \? trackingPilot.trackedUrl' "$INDEX_FILE"
rg -q 'getSessionBackGeneratedQrSrc\(registrationUrl\)' "$INDEX_FILE"

tracking_key="${tracked_url##*/r/}"
stored_metadata="$(run_sttt drush sql:query "SELECT CONCAT(t.name, '|', l.medium, '|', l.campaign, '|', l.placement, '|', l.destination_url) FROM sttt_registration_tracking_link l JOIN taxonomy_term_field_data t ON t.tid = l.source_tid WHERE l.tracking_key = '$tracking_key'")"
[[ "$stored_metadata" == "Promo Card|qr|facebook-promo-houston-methodist-2026-10-01-emotional-care|facebook-promo-registration-qr|$fallback_url" ]] || { echo "Stored metadata mismatch: $stored_metadata" >&2; exit 1; }

before_clicks="$(run_sttt drush sql:query "SELECT COUNT(*) FROM sttt_registration_tracking_click c JOIN sttt_registration_tracking_link l ON l.id = c.tracking_link_id WHERE l.tracking_key = '$tracking_key'" | tr -d '[:space:]')"
headers="$(mktemp)"
trap 'rm -f "$headers"' EXIT
curl -fsS -k -D "$headers" -o /dev/null "$tracked_url"
status="$(awk 'NR == 1 {print $2}' "$headers")"
location="$(awk 'tolower($1) == "location:" {$1=""; sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, ""); print; exit}' "$headers")"
[[ "$status" == "302" ]] || { echo "Expected HTTP 302, got $status." >&2; exit 1; }
[[ "$location" == "$fallback_url" ]] || { echo "Redirect destination mismatch: $location" >&2; exit 1; }

after_clicks="$(run_sttt drush sql:query "SELECT COUNT(*) FROM sttt_registration_tracking_click c JOIN sttt_registration_tracking_link l ON l.id = c.tracking_link_id WHERE l.tracking_key = '$tracking_key'" | tr -d '[:space:]')"
[[ "$after_clicks" -eq $((before_clicks + 1)) ]] || { echo "Expected one new click record; before=$before_clicks after=$after_clicks." >&2; exit 1; }

fallback_status="$(curl -sS -k -o /dev/null -w '%{http_code}' --max-time 20 "$fallback_url")"
case "$fallback_status" in
  2*|3*) ;;
  *) echo "Direct Zoom fallback returned HTTP $fallback_status." >&2; exit 1 ;;
esac

echo "Phase 1D verified: session=$session_uuid status=$status clicks_delta=1 fallback_http=$fallback_status"
