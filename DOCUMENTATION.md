# Facebook Promo Card v2 — Technical Documentation

**File:** `index.html`  
**Location:** `drupal-oav/plans/figma-make/facebook-promo-v2/`  
**Purpose:** Single-file in-browser tool for generating, previewing, and exporting session promo cards for STTT (Somebody To Talk To). Cards are exported as PNG or PDF for use on Facebook and other social platforms, or sent directly to a printer.

---

## 1. Architecture Overview

The entire tool is a single self-contained HTML file with no build step and no server-side rendering. It works entirely in a browser tab.

```
index.html
├── <head>
│   ├── CDN: dom-to-image-more@3.4.5   (DOM → PNG rasteriser)
│   ├── CDN: jsPDF@2.5.2               (PNG → PDF wrapper)
│   └── <style>                        (all CSS, ~400 lines)
└── <body>
    ├── .search-panel                  (card-type dropdown + timezone dropdown + session search)
    ├── .controls (hidden initially)   (card side, size + export buttons)
    └── .preview-wrapper (hidden)      (the actual print card)
        └── .print-surface             (the 4-zone card)
            ├── Zone 1: .logo-bar
            ├── Zone 2: .session-band
            ├── Zone 3: .presenter-section
            └── Zone 4: .fine-print
    └── <script>                       (all JS, ~340 lines)
```

**Key constraint:** Both partner logos are embedded as base64 inside the HTML. This is why the file is ~279 KB despite having no external assets at runtime. The card can be used fully offline after initial load.

**Initial state:** `.controls` and `.preview-wrapper` are hidden via `style="display:none"`. They are only revealed on the first successful call to `populateCard()`, ensuring the user always searches before seeing a card.

**Card type selector:** `#session-card-type` sits beside the search input. The search row also includes `#btn-clear`, which resets the current search/card state. The selector has two options:

| Label | Value | Layout |
|-------|-------|--------|
| Medical Amyloidosis Session - Spotlight | `foundation` | New 3-logo card |
| Medical Amyloidosis Session - Non Spotlight | `classic` | Original card |

Changing the dropdown calls `setLayout()` and then `resetSearchState()`: the search text is cleared, results are removed, controls/preview are hidden, and the user is prompted to enter a new search term.

---

## 2. Design System (CSS Custom Properties)

Defined on `:root`. All components reference these variables; never use raw colour values in new rules.

| Variable        | Value       | Usage                                      |
|-----------------|-------------|--------------------------------------------|
| `--card-width`  | `6in`        | Print surface default width                |
| `--card-height` | `4in`        | Print surface default height               |
| `--maroon`      | `#8B1F2D`   | Primary brand colour; band bg, titles, CTAs |
| `--maroon-dark` | `#6E1A24`   | Reserved (not currently applied)            |
| `--gold`        | `#FFE8A3`   | Series label text on maroon band            |
| `--border`      | `#E8E8E8`   | Logo bar bottom border                      |
| `--border-rose` | `#DDD0D2`   | Headshot border, date pill border, QR border |
| `--bg-rose`     | `#f5eaec`   | Headshot placeholder bg, date pill bg       |

**Typography:** `'Helvetica Neue', Helvetica, Arial, sans-serif` throughout. No web font loading — deliberate, ensures print fidelity without network dependency.

---

## 3. Card Layout — Four Zones

The `.print-surface` is a vertical flex column. Zones 1, 2, and 4 are `flex-shrink: 0` (fixed height). Zone 3 is `flex: 1` (fills remaining space).

```
┌──────────────────────────────────────────────────────┐
│  ZONE 1 · Logo Bar (72px)                            │
│  New: [partner] | [disease foundation] | [STTT]     │
│  Old: [STTT] | [date · time] | [foundation]         │
├──────────────────────────────────────────────────────┤
│  ZONE 2 · Session Band (maroon)                      │
│  New: [series label] [session title]                 │
│  Old: [series label] [session title] [partner pill]  │
├──────────────────────────────────────────────────────┤
│  ZONE 3 · Presenter Section (flex: 1)                │
│  [headshot] │ [date pill + desc + CTA] │ [QR code]   │
├──────────────────────────────────────────────────────┤
│  ZONE 4 · Fine Print (~30px)                         │
└──────────────────────────────────────────────────────┘
```

### Zone 1 — Logo Bar (`.logo-bar`)

`display: flex; justify-content: space-between; height: 72px`

| Element                  | Class / ID      | Notes                                           |
|--------------------------|-----------------|-------------------------------------------------|
| Partner logo             | `#uoc-pill`     | Base64 PNG reused from the old partner pill; moved into header by JS |
| Divider                  | `.logo-divider` | Visible separator between each header logo      |
| Disease foundation logo  | `.logo-left`    | Default Amyloidosis Foundation logo; in Non Spotlight, replaced by matched `field_indication_logo` |
| Divider                  | `.logo-divider` | Visible separator between each header logo      |
| Right logo               | `.logo-right`   | Spotlight default OAV, Non Spotlight default STTT; in Spotlight, replaced by matched `field_indication_logo` |

The center date/time block still exists for the classic layout. In the new `foundation` layout it is hidden, and date/time display lives in Zone 3.

### Zone 2 — Session Band (`.session-band`)

`background: var(--maroon); display: flex; justify-content: space-between`

| Element           | Class / ID              | Visibility                             |
|-------------------|-------------------------|----------------------------------------|
| Series label row  | `#band-series-row`      | `display: none` → `.visible` when `series_label` present |
| Series dot (SVG)  | `.band-series-dot`      | Gold star SVG icon, always inside row  |
| Series text       | `#band-series-label`    | `--gold` colour, italic, 14px          |
| Session title     | `#band-title`           | White, 700 weight, 17px; stays one line when it fits, otherwise splits at the first colon |

In the `foundation` layout, there is no partner pill in the maroon band; `#uoc-pill` is moved into Zone 1 as the left logo. In the `classic` layout, the same element is moved back into the maroon band as the original partner pill.

### Zone 3 — Presenter Section (`.presenter-section`)

`display: grid; grid-template-columns: 110px 1fr 96px; column-gap: 16px; padding: 12px 22px 0`

Three fixed-width columns:

**Column 1 — Headshot (`.headshot-col`)**

- 94×94px circular image with `--border-rose` ring
- `#headshot-img`: shown when `headshot_base64` available, hidden otherwise
- `#headshot-fallback`: shown when no headshot; text "No photo"
- `#presenter-name`: maroon, 11.5px, 800 weight — assembled from title + first/last + suffix
- `#presenter-cred`: populated from `presenter.name_suffix`
- `#presenter-role`: populated with presenter employer fields when available; does not use the session `row.partner`

**Column 2 — Content (`.content-col`)**

- `.date-pill`: rose bg pill with calendar SVG icon
  - `#date-pill-date`: "May 18, 2026"
  - `#tz-row`: selected timezone only, e.g. "6:00 PM ET"
  - `#timezone-select`: visible form dropdown with Eastern, Central, Mountain, Arizona, Pacific, Alaska, and Hawaii options; defaults to Eastern Time and persists in `localStorage`
- `#session-desc`: 11.5px body text, HTML-stripped
- `.register-row`: "Register free:" label + `#register-url` monospace chip
- `.microsite-row`: static UChicago microsite link, hidden on the classic/non-spotlight layout

**Column 3 — QR Code (`.qr-col`)**

- 82×82px bordered box
- `#qr-img`: 78×78px image, shown when `qr_base64` available
- `#qr-placeholder`: fallback text when no QR
- `.qr-label`: "Scan to Register", uppercase, 8px, maroon

### Zone 4 — Fine Print (`.fine-print`)

Static italic text. 10.5px, `#666`, `border-top: 1px solid #F0F0F0`. `margin-top: auto` pushes it to the bottom of the flex column.

---

## 4. Size Variants

Two sizes available via the size toggle buttons.

| Size  | Button     | CSS class added       | Dimensions        | DPI target | Pixel output  |
|-------|------------|-----------------------|-------------------|------------|---------------|
| 4×6   | `#btn-4x6` | _(none, default)_     | 6in × 4in         | 300        | 1800 × 1200   |
| 3×5   | `#btn-3x5` | `.size-3x5` on surface| 5in × 3in         | 300        | 1500 × 900    |

The 3×5 variant uses a cascade of `.print-surface.size-3x5 .{component}` overrides to scale down every font, spacing, and image dimension proportionally. There are 20 override rules covering all zones.

---

## 5. JavaScript Modules

### 5.1 Card Type — `setLayout(layout)`

Switches between the two card types selected in `#session-card-type`.

| Dropdown label | Internal value | Surface class | Behaviour |
|----------------|----------------|---------------|-----------|
| Medical Amyloidosis Session - Spotlight | `foundation` | `.layout-foundation` | New 3-logo header layout; partner logo moves to Zone 1; right logo defaults to OAV, then switches to matched indication logo when available |
| Medical Amyloidosis Session - Non Spotlight | `classic` | `.layout-classic` | Original layout; partner logo moves back to the maroon band; right logo stays STTT; left logo switches to matched indication logo when available |

The dropdown `change` handler calls `resetSearchState()` after switching layout, so stale session data is never reused across card types.

### 5.2 Reset Search — `resetSearchState(message)`

Clears the search input, cancels any pending debounce, increments `searchToken` to invalidate in-flight API responses, clears search results, hides `#controls-bar` and `#preview-wrapper`, updates `#search-status`, and focuses the search input. It is called by the card-type dropdown and the `Clear` button.

### 5.3 Size Toggle — `setSize(s)`

Adds/removes `.size-3x5` from `#print-surface`. Toggles `.active` class on the two size buttons. Updates the `#size-label` text.

### 5.4 Print — `handlePrint()`

1. Detects current size.
2. Dynamically injects a `<style id="__print-page-style">` with `@page { size: 6in 4in landscape; margin: 0 }` (or 5in 3in for 3×5).
3. Calls `window.print()`.
4. Removes the injected style after 1 second via `setTimeout`.

The `@media print` rule hides `.controls`, `.card-label`, and `.search-panel` automatically.

### 5.5 Capture Pipeline — `captureCard(scale, pxW, pxH)`

Core rasterisation function used by both PNG and PDF exports.

**Extension stylesheet bug workaround:** Browser extensions inject `@font-face` rules referencing `chrome-extension://` URLs. `dom-to-image-more` scans all `document.styleSheets` and tries to fetch those URLs, getting `ERR_FILE_NOT_FOUND`, which aborts the export with a Blob error.

Fix implemented:
1. Iterate `document.styleSheets`.
2. For each sheet, attempt to read `cssRules`. Cross-origin sheets throw — catch and disable those too.
3. If any rule contains `chrome-extension:`, `moz-extension:`, or `safari-extension:` — disable the sheet.
4. Call `domtoimage.toPng()` with a `transform: scale(N)` applied in the style override to reach target pixel dimensions.
5. In `finally`: re-enable all disabled sheets.

Scale is computed as: `cfg.pxW / surface.offsetWidth` — i.e., how much to multiply the rendered CSS inches to reach target raster pixels.

### 5.6 PNG Export — `downloadPNG()`

1. Determines size config (px dimensions + filename tag).
2. Calls `captureCard()`.
3. Creates a temporary `<a>` element, sets `href` to the data URL, triggers `.click()`, then removes it.
4. Filename includes layout and size, e.g. `facebook-promo-3-logo-4x6.png` or `facebook-promo-classic-3x5.png`.

### 5.7 PDF Export — `downloadPDF()`

1. Same size detection as PNG.
2. Calls `captureCard()` to get a PNG data URL.
3. Creates a `jsPDF` instance: `{ orientation: 'landscape', unit: 'in', format: [wIn, hIn] }`.
4. Calls `pdf.addImage(dataUrl, 'PNG', 0, 0, wIn, hIn)` — zero margins, fills page exactly.
5. Calls `pdf.save(filename)`.

### 5.8 Search — `runSearch()`

**API endpoint:** `https://www.somebodytotalkto.com/api/spotlight/microsite/session/search?q={query}`

**Trigger conditions:**
- Input `keydown` Enter → immediate
- Button click → immediate (clears debounce to prevent duplicate)
- Clear button → calls `resetSearchState()`
- Input `input` event → 400ms debounce, triggers only when `length >= 3`
- Input `paste` event → trims leading/trailing whitespace from pasted search text
- Minimum query length: 2 characters

**Race condition protection:** A `searchToken` integer is incremented on every new search call. The token value is captured in closure at call time. Before rendering results (or errors), the response checks if `token === searchToken`. If not, the response is silently discarded. This prevents out-of-order responses from stomping a newer result.

**Result handling:**
- 0 results → status message only
- 1 result → auto-calls `populateCard(rows[0])`
- 2+ results → renders clickable `.search-result-item` list; each click calls `populateCard(row)` and clears the list

### 5.9 Populate Card — `populateCard(row)`

Maps API response fields onto DOM elements. Detailed field-by-field mapping:

| API Field              | DOM Element           | Transform applied                                              |
|------------------------|-----------------------|----------------------------------------------------------------|
| `row.date`             | `#header-date`        | Still populated for compatibility, but hidden in current layout |
| selected timezone value | `#header-time`        | Populates the classic Non Spotlight center header time using the persisted timezone dropdown; uses API-provided ET/CT/MT/PT when available and converts from ET for Arizona/Alaska/Hawaii |
| `row.series_label`     | `#band-series-label`  | Sets text; adds `.visible` to `#band-series-row` if non-empty  |
| `row.indication` / variants | `.logo-left` / `.logo-right` | Matched against `/api/session-editor/indications`; uses `field_indication_logo.data` as a 24-hour local cache |
| `row.title`            | `#band-title`         | Text is preserved; if the full title does not fit on one line, `Session Type:` becomes line one and the remaining title becomes line two |
| `row.partner`          | `#uoc-pill`           | Adds `.visible` to the header partner logo if non-empty        |
| `row.presenters[0]`    | `#presenter-name`     | Assembled: `title + first + last`                              |
| `presenter.name_suffix`| `#presenter-cred`     | Displays credential/suffix under presenter name                |
| presenter employer field | `#presenter-role` | Displays the presenter's employer when available; does not use the session `row.partner` |
| `row.date`             | `#date-pill-date`     | Raw string, no transform                                       |
| selected timezone value | `#tz-row`             | Displays only the timezone selected in `#timezone-select`; defaults to Eastern Time, persists in `localStorage`, and converts from ET for zones missing from the API response |
| `row.description`      | `#session-desc`       | HTML-stripped via temp `<div>.textContent`                     |
| `row.headshot_base64`  | `#headshot-img`       | Set as `src`; toggles img/fallback visibility                  |
| `row.qr_base64`        | `#qr-img`             | Set as `src`; toggles img/placeholder visibility               |
| `row.short_url`        | `#register-url`       | Prefers short URL; falls back to `row.reg_link.url`; strips `https://`; truncates at 36 chars if no short URL |
| Static UChicago link   | `#microsite-url`      | Displays `uchicago.oneamyloidosisvoice.com`; hidden on classic layout |

**Card reveal:** On the first `populateCard()` call, `#controls-bar` and `#preview-wrapper` have their `display:none` removed, revealing the card and export controls.

---

## 6. API Response Contract

Expected shape from `GET /api/spotlight/microsite/session/search?q=`:

```json
{
  "data": [
    {
      "title":          "How to Build a Healthcare Team You Trust",
      "session_type":   "Webinar",
      "series_label":   "Spotlight Series",
      "partner":        "University of Calgary",
      "date":           "May 21, 2026",
      "time":           "6:00 PM ET",
      "times_by_zone": {
        "ET": "6:00 PM",
        "CT": "5:00 PM",
        "MT": "4:00 PM",
        "PT": "3:00 PM"
      },
      "description":    "<p>Building a strong healthcare team…</p>",
      "presenters": [
        {
          "first_name":    "Jane",
          "last_name":     "Smith",
          "display_name":  "Jane Smith",
          "title":         "Dr.",
          "name_suffix":   "MD, FRCPC"
        }
      ],
      "headshot_base64": "data:image/jpeg;base64,…",
      "qr_base64":       "data:image/png;base64,…",
      "short_url":       "bit.ly/sttt-xyz",
      "reg_link": {
        "url": "https://zoom.us/webinar/register/…"
      }
    }
  ]
}
```

**Notes:**
- `headshot_base64` and `qr_base64` include the `data:image/…;base64,` prefix — set directly as `src`.
- `description` may contain HTML markup; the card strips it.
- `short_url` is optional; fallback chain is `short_url → reg_link.url → static default`.
- Only `presenters[0]` is used; multi-presenter sessions show only the first presenter.

---

## 7. Known Quirks and Debt

### `#presenter-role` displays presenter employer

The DOM element ID is used for the presenter employer line under credentials. The frontend supports common presenter field names such as `employer`, `employer_name`, `organization`, `company`, and `institution`. It intentionally does not fall back to the session-level `row.partner`, because that is the session/program partner rather than the presenter's employer.

### Credential display uses `name_suffix`

The current layout displays `presenter.name_suffix` in `#presenter-cred`. This works for suffix-style credentials such as `MD, FRCPC`, but it is not a dedicated `credentials` field.

### Single presenter only

`(row.presenters || [])[0]` — only the first presenter is rendered. No layout exists for co-presenters.

### Partner, foundation, OAV, STTT, and indication logos

The default header logos are embedded as base64. The partner logo shown in `#uoc-pill` is a single hardcoded image and does not change based on `row.partner`. `setLayout()` applies defaults, then the session indication is matched against `https://somebodytotalkto.com/api/session-editor/indications`. The matched `field_indication_logo.data` is cached in `localStorage` for 24 hours and used to replace `.logo-left` in Non Spotlight or `.logo-right` in Spotlight.

### File size

At ~301 KB, the file is large for an HTML document. Most of that size is base64-encoded image data. This is intentional for portability but makes the file impractical to diff or code-review in a standard tool.

---

## 8. Export Specifications

| Format | Size  | Pixel dimensions | Colour profile | Filename                 |
|--------|-------|------------------|----------------|--------------------------|
| PNG    | 4×6   | 1800 × 1200      | sRGB           | `facebook-promo-{layout}-4x6.png` |
| PNG    | 3×5   | 1500 × 900       | sRGB           | `facebook-promo-{layout}-3x5.png` |
| PDF    | 4×6   | 1800 × 1200 img  | landscape, 6×4in | `facebook-promo-{layout}-4x6.pdf` |
| PDF    | 3×5   | 1500 × 900 img   | landscape, 5×3in | `facebook-promo-{layout}-3x5.pdf` |
| Print  | both  | @page native      | exact colour   | _(browser print dialog)_ |

The PDF is image-only (rasterised PNG embedded in a PDF wrapper). It is not a vector PDF. Text is not selectable in the output PDF.

---

## 9. Dependencies

| Library             | Version  | Source                                   | Purpose                          |
|---------------------|----------|------------------------------------------|----------------------------------|
| dom-to-image-more   | 3.4.5    | `cdn.jsdelivr.net`                       | DOM → PNG rasterisation          |
| jsPDF               | 2.5.2    | `cdn.jsdelivr.net`                       | PNG → PDF wrapping               |

Both loaded via `<script src>` in `<head>`. No npm, no build step. If CDN is unavailable, exports will silently fail (try/catch surfaces error via `alert()`). Print still works without network.

---

## 10. Adding a New Field to the Card

1. Add the DOM element inside the appropriate zone in `<body>`.
2. Add CSS rules for it (follow existing naming conventions).
3. If the field needs to be smaller in 3×5 mode, add a `.print-surface.size-3x5 .your-class` override rule.
4. Add the field to the `populateCard()` mapping block with a comment in the header comment (lines ~706–719).
5. Confirm the API returns the field — check `SEARCH_API` response shape.
6. If the field is conditionally visible (like `.uoc-pill` or `.band-series`), use the `.visible` class toggle pattern rather than direct `display` manipulation.

---

## 11. File Structure

```
facebook-promo-v2/
├── index.html          Single-file tool (~279 KB, includes base64 logos)
└── DOCUMENTATION.md    This file
```

No other files. The tool has no dependencies on the surrounding Drupal codebase at runtime — it communicates only with the live STTT search API.
