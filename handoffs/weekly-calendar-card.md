Goal:
Generate weekly Facebook portrait cards for any selected ISO week, including approved sessions without an assigned partner.

Current status:
Implemented, verified, and merged into the promo repository's local `main`; not pushed or deployed.

Confirmed decisions:
- With no partner selected, combine all promo-enabled partner sessions with eligible unassigned sessions for the selected week.
- Default the indication filter to Amyloidosis. Provide All Indications plus the indications actually present in the selected week, filtering both partner and unassigned sessions.
- Show up to four sessions per card and paginate any additional sessions. Week 47's four Amyloidosis sessions fit on one card.
- Keep all three header logo selectors available in aggregate mode, using the same logo choices.
- Monday uses Patient Best Practices; Tuesday and Wednesday use Disease Specific; Thursday uses Psycho-Social.
- Put each session's QR and short URL below its title and times. Keep a compact scan-safe QR without the red Register badge or decorative container.
- Keep the export at 1440px wide and cap height at 1800px.

Relevant files:
- `index.html`
- `scripts/test_weekly_calendar_card.js`
- Drupal API: `web/modules/custom/sttt_spotlight/src/Controller/SpotlightMicrositeApiController.php`
- Drupal route: `web/modules/custom/sttt_spotlight/sttt_spotlight.routing.yml`
- Drupal test: `web/modules/custom/sttt_spotlight/tests/src/Kernel/SpotlightMicrositeSeriesApiTest.php`

Changes completed:
- Added an ISO-week-bounded API for approved, published, unassigned sessions and merged its results with partner sessions in aggregate mode.
- Added the Amyloidosis-first indication selector and moved indication filtering client-side so it also applies to unassigned sessions.
- Increased the page capacity to four sessions, fitting Week 47's four Amyloidosis sessions on one card while retaining pagination.
- Exposed all three header logo selectors in aggregate mode.
- Kept each session's QR and first-party short URL embedded beneath the session title and schedule.

Verification:
- The focused weekly-card test passes with bundled Node 24, including indication filtering, four sessions on one page, all-indications pagination, and three logo controls. `git diff --check` passes.
- Local browser preview with no partner selected showed all four Week 47 Amyloidosis sessions (Monday through Thursday) on one 1440×1754px card. All Indications showed five sessions across two cards.
- The third logo selector accepted a logo with a loaded image; all three selectors expose the same logo list.
- Earlier Drupal API verification passed: 6 kernel tests, 277 assertions; the unassigned-week endpoint returned HTTP 200 for `2026-W47`, including Thursday's short URL and QR.

Remaining work:
- None for local implementation. No push or deployment was requested.

Next recommended action:
Deploy only if requested.
