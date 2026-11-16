Goal:
Generate weekly Facebook portrait cards for any selected ISO week, including approved sessions without an assigned partner.

Current status:
Implemented, verified, and merged into the promo repository's local `main`; not pushed or deployed.

Confirmed decisions:
- With no partner selected, combine all promo-enabled partner sessions with eligible unassigned sessions for the selected week.
- Show up to three sessions per card and paginate additional sessions.
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
- Included the Week 47 Thursday Psycho-Social session on card 2, with its own first-party QR and short URL.
- Reduced inline QR display to 52 CSS px and removed the Register badge and decorative border/background.

Verification:
- `node scripts/test_weekly_calendar_card.js` and `git diff --check` pass after merge.
- Drupal API kernel suite passes: 6 tests, 277 assertions.
- After cache rebuild and merge, the unassigned-week endpoint returned HTTP 200 for `2026-W47`, including Thursday's short URL and QR; the existing partner sessions route returned HTTP 200.
- Local browser preview showed Thursday on card 2; the card was 1440×1263px, below the Facebook 1440×1800px maximum.

Remaining work:
- None for local implementation. No push or deployment was requested.

Next recommended action:
Review the local QA preview; deploy only if requested.
