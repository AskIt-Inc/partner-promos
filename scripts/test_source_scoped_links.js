const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('index.html', 'utf8');

assert(source.includes('id="register-url" href=""'), 'registration output must retain a click target');
assert(source.includes('overflow-wrap: anywhere;'), 'printed URLs must wrap instead of clipping');
assert(source.includes('word-break: break-word;'), 'printed URLs must break at narrow card sizes');
assert(source.includes('text-overflow: clip;'), 'registration output must not use an ellipsis');
assert(source.includes("new Set(['facebook-promo', 'facebook-promo-multi', 'foundation'])"));
assert(source.includes('row.tracked_registration_url'), 'renderer must consume the source-scoped canonical URL');
assert(source.includes('const canonicalUrl = trackedUrl || (trackingPilot'), 'renderer must preserve the canonical target');
assert(source.includes('const shortDisplayUrl = getRegistrationShortUrl(row, canonicalUrl)'), 'renderer must use the API short URL for display');
assert(source.includes('getSessionRegistrationQrSrc(row, canonicalUrl)'), 'QR generation must use the canonical target');
assert(source.includes('regUrlEl.href = canonicalUrl'), 'click target must use the canonical target');
assert(source.includes('addSourceCardType(getSessionApiUrl(getAllCalendarSessionsApiUrl'), 'full session detail must include source card type');
assert(source.includes('fitSinglePresenterDescription();'), 'single-presenter cards must keep the registration row inside the card');
assert(source.includes("setText('calendar-microsite-url', getReadableDisplayUrl(cfg.micrositeUrl))"), 'calendar URL must use readable display text');
assert(source.includes("root.style.setProperty('--calendar-accent', '#FFE8A3')"), 'calendar accent must remain fixed gold');

const baseStart = source.indexOf('function getPromoTrackingBaseUrl');
const baseEnd = source.indexOf('function getSessionRegistrationTrackedUrl', baseStart);
const shortStart = source.indexOf('function getApprovedRegistrationShortUrl');
const shortEnd = source.indexOf('function getSessionRegistrationTrackingPilot', shortStart);
const readableStart = source.indexOf('function getReadableDisplayUrl');
const readableEnd = source.indexOf('function getGeneratedComingSoonConfig', readableStart);
assert(baseStart >= 0 && baseEnd > baseStart, 'tracking base helper must be present');
assert(shortStart >= 0 && shortEnd > shortStart, 'approved short-link helper must be present');
assert(readableStart >= 0 && readableEnd > readableStart, 'readable URL helper must be present');

const getApprovedShortUrl = new Function(
  'window',
  'promoRuntimeConfig',
  `${source.slice(baseStart, baseEnd)}
   ${source.slice(shortStart, shortEnd)}
   return getApprovedRegistrationShortUrl;`,
)(
  { location: { href: 'https://askit-inc.github.io/partner-promos/' } },
  { environment: 'production', stttPublicBaseUrl: 'https://somebodytotalkto.com' },
);

const approvedAlias = 'https://somebodytotalkto.com/s/8592a7f4c6';
const approvedAliasWithTracking = approvedAlias + '?utm_source=promo-card&sttt_tracking_link_id=246';
assert.strictEqual(getApprovedShortUrl(approvedAlias), approvedAlias);
assert.strictEqual(getApprovedShortUrl(approvedAliasWithTracking), approvedAlias);
assert.strictEqual(getApprovedShortUrl('https://somebodytotalkto.com/r/PIdPiaUemocJlYbn-kavqTzLdUPFNYI4WNngIVWf0Yo'), '');
assert.strictEqual(getApprovedShortUrl('https://bit.ly/4dUqXRm'), '');
assert.strictEqual(getApprovedShortUrl('https://example.com/s/8592a7f4c6'), '');

const displayStart = source.indexOf('function getRegistrationDisplayText');
const displayEnd = source.indexOf('function renderRegistrationDisplayText', displayStart);
assert(displayStart >= 0 && displayEnd > displayStart, 'registration display helper must be present');

const getDisplay = new Function(
  'window',
  'promoRuntimeConfig',
  `${source.slice(readableStart, readableEnd)}
   ${source.slice(baseStart, baseEnd)}
   ${source.slice(shortStart, shortEnd)}
   ${source.slice(displayStart, displayEnd)}
   return getRegistrationDisplayText;`,
)(
  { location: { href: 'https://askit-inc.github.io/partner-promos/' } },
  { environment: 'production', stttPublicBaseUrl: 'https://somebodytotalkto.com' },
);

assert.strictEqual(getDisplay(approvedAliasWithTracking), 'somebodytotalkto.com/s/8592a7f4c6');
assert.strictEqual(getDisplay('https://somebodytotalkto.com/r/bTsxn2r4pBGyfUFN1_9Jq4iIm1TTZBGFB7_6dp3Ts8I?utm_source=promo-card'), '');
assert.strictEqual(getDisplay('https://us06web.zoom.us/meeting/register/EiYDZDaVSqKiNgaDDIMSKg'), '');

console.log('promo-card readable-link source checks passed');
