const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('index.html', 'utf8');

assert(source.includes('id="register-url">'), 'registration output must have a printed URL label');
assert(!source.includes('<a class="register-url"'), 'printed registration URL must not be clickable');
assert(source.includes('overflow-wrap: anywhere;'), 'registration output must wrap instead of clipping');
assert(source.includes("new Set(['facebook-promo', 'facebook-promo-multi', 'foundation'])"));
assert(source.includes('row.tracked_registration_url'), 'renderer must prefer the source-scoped redirect');
assert(source.includes('4dUqXRm'), 'the known shared legacy Bitly link must be rejected');
assert(source.includes('const canonicalRegistrationUrl = trackedUrl || (trackingPilot'), 'renderer must keep the canonical tracked URL separate');
assert(source.includes('isCanonicalTrackedRegistrationUrl(canonicalUrl)'), 'QR generation must use the canonical tracked URL');
assert(source.includes('regUrlEl.removeAttribute(\'href\')'), 'printed registration URL must stay non-clickable');
assert(source.includes('addSourceCardType(getSessionApiUrl(getAllCalendarSessionsApiUrl'), 'full session detail must include source card type');
assert(source.includes('fitSinglePresenterDescription();'), 'single-presenter cards must keep the registration row inside the card');
assert(source.includes("root.style.setProperty('--calendar-accent', '#FFE8A3')"), 'calendar gold must remain fixed');
assert(!source.includes('body[data-partner="vamp"] .calendar-band-eyebrow-text {\n  color: #FFD84D;'), 'calendar eyebrow gold must not vary by partner');
assert(!source.includes('body[data-partner="vamp"] .calendar-chip-month {\n  color: #FFD84D;'), 'calendar date-chip gold must not vary by partner');

const baseStart = source.indexOf('function getPromoTrackingBaseUrl');
const baseEnd = source.indexOf('function getSessionRegistrationTrackedUrl', baseStart);
const shortStart = source.indexOf('function getApprovedRegistrationShortUrl');
const shortEnd = source.indexOf('function getSessionRegistrationTrackingPilot', shortStart);
assert(baseStart >= 0 && baseEnd > baseStart, 'tracking base helper must be present');
assert(shortStart >= 0 && shortEnd > shortStart, 'approved short-link helper must be present');

const getApprovedShortUrl = new Function(
  'window',
  'promoRuntimeConfig',
  `${source.slice(baseStart, shortEnd)}
   return getApprovedRegistrationShortUrl;`,
)(
  { location: { href: 'https://askit-inc.github.io/partner-promos/' } },
  { environment: 'production', stttPublicBaseUrl: 'https://somebodytotalkto.com' },
);

const approvedAlias = 'https://somebodytotalkto.com/s/8592a7f4c6?utm_source=promo-card&sttt_card_type=facebook-promo';
assert.strictEqual(getApprovedShortUrl(approvedAlias), 'https://somebodytotalkto.com/s/8592a7f4c6');
assert.strictEqual(getApprovedShortUrl('https://somebodytotalkto.com/r/PIdPiaUemocJlYbn-kavqTzLdUPFNYI4WNngIVWf0Yo'), '');
assert.strictEqual(getApprovedShortUrl('https://bit.ly/4dUqXRm'), '');
assert.strictEqual(getApprovedShortUrl('https://example.com/s/8592a7f4c6'), '');

const displayStart = source.indexOf('function getSafeRegistrationDisplayText');
const displayEnd = source.indexOf('function fitSessionPromoLayout', displayStart);
assert(displayStart >= 0 && displayEnd > displayStart, 'registration display helper must be present');

const getDisplay = new Function(
  'window',
  'promoRuntimeConfig',
  `const MAX_REGISTRATION_DISPLAY_LENGTH = 44;
   ${source.slice(baseStart, shortEnd)}
   ${source.slice(source.indexOf('function isSharedLegacyBitlyUrl'), displayStart)}
   ${source.slice(displayStart, displayEnd)}
   return getRegistrationDisplayText;`,
)({ location: { href: 'https://askit-inc.github.io/partner-promos/' } }, {
  environment: 'production',
  stttPublicBaseUrl: 'https://somebodytotalkto.com',
});

const facebook = 'https://somebodytotalkto.com/r/bTsxn2r4pBGyfUFN1_9Jq4iIm1TTZBGFB7_6dp3Ts8I?utm_campaign=facebook';
const foundation = 'https://somebodytotalkto.com/r/91jaNGQt5zgWvl8PGWkQFF_lVuVHufC_65LcRBym0Cg?sttt_card_type=foundation';
const facebookLabel = getDisplay({ short_url: approvedAlias, tracked_registration_url: facebook });
const foundationLabel = getDisplay({ tracked_registration_url: foundation });

assert.strictEqual(facebookLabel, 'somebodytotalkto.com/s/8592a7f4c6');
assert.strictEqual(foundationLabel, 'somebodytotalkto.com/register');
assert(!facebookLabel.includes('/r/'));
assert(!facebookLabel.includes('?'));
assert(!foundationLabel.includes('/r/'));
assert.strictEqual(getDisplay({ short_url: 'https://bit.ly/short-code' }), 'bit.ly/short-code');
assert.strictEqual(getDisplay({ short_url: 'https://us06web.zoom.us/meeting/register/EiYDZDaVSqKiNgaDDIMSKg' }), 'somebodytotalkto.com/register');

console.log('partner-promos source-scoped link checks passed');
