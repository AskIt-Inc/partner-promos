#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STTT_ROOT="${STTT_ROOT:-/Users/sukhjindersingh/Sites/sttt}"
CONFIG_FILE="${PROJECT_ROOT}/partner-configs.json"
INDEX_FILE="${PROJECT_ROOT}/index.html"
GENERATOR="${PROJECT_ROOT}/scripts/generate-runtime-config.js"
LOCAL_BASE_URL="https://local-sttt.somebodytotalkto.com:8443"
PRODUCTION_BASE_URL="https://somebodytotalkto.com"
CONFIG_ONLY="${1:-}"

run_sttt() {
  (cd "${STTT_ROOT}" && ddev exec "$@")
}

session_uuid="$(jq -r '.registrationTrackingPilot.sessionUuid' "${CONFIG_FILE}")"
session_nid="$(jq -r '.registrationTrackingPilot.sessionNid' "${CONFIG_FILE}")"
tracking_key="$(jq -r '.registrationTrackingPilot.trackingKey' "${CONFIG_FILE}")"
fallback_url="$(jq -r '.registrationTrackingPilot.fallbackUrl' "${CONFIG_FILE}")"
metadata="$(jq -r '[.registrationTrackingPilot.source, .registrationTrackingPilot.medium, .registrationTrackingPilot.campaign, .registrationTrackingPilot.placement] | join("|")' "${CONFIG_FILE}")"

[[ "${session_uuid}" == "075d0ed1-293d-43ae-9ab7-7402a7ca1696" ]] || { echo "Unexpected pilot session UUID." >&2; exit 1; }
[[ "${session_nid}" == "1323" ]] || { echo "Unexpected pilot session NID." >&2; exit 1; }
[[ "${tracking_key}" =~ ^[A-Za-z0-9_-]{43}$ ]] || { echo "Tracking key format is invalid." >&2; exit 1; }
[[ "${fallback_url}" == "https://us06web.zoom.us/meeting/register/CylOj10UQoevNcpEXgBzYg" ]] || { echo "Pilot fallback destination changed." >&2; exit 1; }
[[ "${metadata}" == "Promo Card|qr|facebook-promo-houston-methodist-2026-10-01-emotional-care|facebook-promo-registration-qr" ]] || { echo "Pilot metadata changed." >&2; exit 1; }

if jq -e '.registrationTrackingPilot.trackedUrl' "${CONFIG_FILE}" >/dev/null; then
  echo "Shared configuration must not store an environment-specific tracked URL." >&2
  exit 1
fi
if grep -En 'local-sttt\.somebodytotalkto\.com|\.ddev\.site' "${CONFIG_FILE}" >/dev/null; then
  echo "Shared partner configuration contains a local-only hostname." >&2
  exit 1
fi

grep -Fq '<script src="runtime-config.js"></script>' "${INDEX_FILE}"
grep -Fq 'getSessionRegistrationTrackedUrl' "${INDEX_FILE}"
grep -Fq 'getApprovedRegistrationShortUrl' "${INDEX_FILE}"
grep -Fq 'getSessionRegistrationQrSrc(row, canonicalUrl)' "${INDEX_FILE}"
grep -Fq 'const shortDisplayUrl = getRegistrationShortUrl(row, canonicalUrl)' "${INDEX_FILE}"

runtime_dir="$(mktemp -d)"
trap 'rm -rf "${runtime_dir}"' EXIT
STTT_PUBLIC_BASE_URL="${LOCAL_BASE_URL}" \
  node "${GENERATOR}" --environment=local --output="${runtime_dir}/local.js" >/dev/null
node "${GENERATOR}" --check="${runtime_dir}/local.js" >/dev/null
STTT_PUBLIC_BASE_URL="${PRODUCTION_BASE_URL}" \
  node "${GENERATOR}" --environment=production --output="${runtime_dir}/production.js" >/dev/null
node "${GENERATOR}" --check="${runtime_dir}/production.js" >/dev/null

for invalid_base in '' "${LOCAL_BASE_URL}" 'https://127.0.0.1' 'not-a-url'; do
  if STTT_PUBLIC_BASE_URL="${invalid_base}" \
    node "${GENERATOR}" --environment=production --output="${runtime_dir}/invalid.js" >/dev/null 2>&1; then
    echo "Production runtime generation accepted an invalid base URL." >&2
    exit 1
  fi
done

if [[ -f "${PROJECT_ROOT}/runtime-config.js" ]]; then
  node "${GENERATOR}" --check="${PROJECT_ROOT}/runtime-config.js" >/dev/null
fi

if [[ "${CONFIG_ONLY}" == "--config-only" ]]; then
  echo "Runtime configuration and tracked-link source checks passed."
  exit 0
fi

database_destination="$(run_sttt drush sql:query "SELECT f.field_si_zoom_reg_link_uri FROM node__field_si_zoom_reg_link f JOIN node n ON n.nid = f.entity_id WHERE f.entity_id = ${session_nid} AND f.deleted = 0 AND f.delta = 0 AND n.uuid = '${session_uuid}'" | tr -d '\r' | awk 'NF {print; exit}')"
[[ "${database_destination}" == "${fallback_url}" ]] || { echo "Registration Link URL does not match the approved fallback." >&2; exit 1; }

stored_metadata="$(run_sttt drush sql:query "SELECT CONCAT(t.name, '|', l.medium, '|', l.campaign, '|', l.placement, '|', l.destination_url) FROM sttt_registration_tracking_link l JOIN taxonomy_term_field_data t ON t.tid = l.source_tid WHERE l.tracking_key = '${tracking_key}'")"
[[ "${stored_metadata}" == "${metadata}|${database_destination}" ]] || { echo "Stored tracking metadata or destination does not match the pilot." >&2; exit 1; }

tracked_url="${LOCAL_BASE_URL}/r/${tracking_key}"
before_clicks="$(run_sttt drush sql:query "SELECT COUNT(*) FROM sttt_registration_tracking_click c JOIN sttt_registration_tracking_link l ON l.id = c.tracking_link_id WHERE l.tracking_key = '${tracking_key}'" | tr -d '[:space:]')"
headers="${runtime_dir}/headers"
curl -fsS -k -D "${headers}" -o /dev/null --max-time 20 "${tracked_url}"
status="$(awk 'NR == 1 {print $2}' "${headers}")"
location="$(awk 'tolower($1) == "location:" {$1=""; sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, ""); print; exit}' "${headers}")"
[[ "${status}" == "302" ]] || { echo "Local tracked link did not return HTTP 302." >&2; exit 1; }
[[ "${location}" == "${database_destination}" ]] || { echo "Local tracked link destination changed." >&2; exit 1; }

after_clicks="$(run_sttt drush sql:query "SELECT COUNT(*) FROM sttt_registration_tracking_click c JOIN sttt_registration_tracking_link l ON l.id = c.tracking_link_id WHERE l.tracking_key = '${tracking_key}'" | tr -d '[:space:]')"
[[ "${after_clicks}" -eq $((before_clicks + 1)) ]] || { echo "Local tracked link did not record exactly one anonymous click." >&2; exit 1; }

echo "Phase 1G-A local tracked-link verification passed."
