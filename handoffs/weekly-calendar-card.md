Goal:
Generate weekly Facebook portrait cards for any selected ISO week, including approved sessions without an assigned partner.

Current status:
Implemented and verified in the local promo app; ready to commit and fast-forward to local main. Not pushed or deployed.

Confirmed decisions:
- With no partner selected, combine all promo-enabled partner sessions with eligible unassigned sessions for the selected week.
- Show up to three sessions per card and paginate additional sessions.
- Monday uses Patient Best Practices; Tuesday and Wednesday use Disease Specific; Thursday uses Psycho-Social.
- Put each session's QR and short URL below its title and times. Keep a small scan-safe QR, without the red Register badge or decorative container.
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
- `node scripts/test_weekly_calendar_card.js` and `git diff --check` pass.
- Drupal API kernel suite passes: 6 tests, 277 assertions.
- After Drupal cache rebuild, the unassigned-week endpoint returned HTTP 200 for `2026-W47`; the local browser preview showed the Thursday session and matching QR/link on card 2.
- Card dimensions in preview stayed below the 1440×1800px maximum.

Remaining work:
- Commit the QR presentation changes and fast-forward the promo repository's local `main` branch.
- No push or deployment was requested.

Next recommended action:
Complete the local commit and merge, then repeat focused frontend and Drupal runtime checks.
