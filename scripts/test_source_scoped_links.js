const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('index.html', 'utf8');

assert(source.includes('id="register-url" href=""'), 'registration output must be a hyperlink');
assert(source.includes('overflow-wrap: anywhere;'), 'registration output must wrap instead of clipping');
assert(source.includes('text-overflow: clip;'), 'registration output must not use an ellipsis');
assert(source.includes("new Set(['facebook-promo', 'facebook-promo-multi', 'foundation'])"));
assert(source.includes('row.tracked_registration_url'), 'renderer must prefer the source-scoped redirect');
assert(source.includes('4dUqXRm'), 'the known shared legacy Bitly link must be rejected');
assert(source.includes('const registrationUrl = shortUrl || trackedUrl || (trackingPilot'), 'renderer must prefer the approved alias');
assert(source.includes('getApprovedRegistrationShortUrl(registrationUrl)'), 'QR generation must prefer the approved alias');
assert(source.includes('addSourceCardType(getSessionApiUrl(getAllCalendarSessionsApiUrl'), 'full session detail must include source card type');
assert(source.includes('fitSinglePresenterDescription();'), 'single-presenter cards must keep the registration row inside the card');

const baseStart = source.indexOf('function getPromoTrackingBaseUrl');
const baseEnd = source.indexOf('function getSessionRegistrationTrackedUrl', baseStart);
const shortStart = source.indexOf('function getApprovedRegistrationShortUrl');
const shortEnd = source.indexOf('function getSessionRegistrationTrackingPilot', shortStart);
assert(baseStart >= 0 && baseEnd > baseStart, 'tracking base helper must be present');
assert(shortStart >= 0 && shortEnd > shortStart, 'approved short-link helper must be present');

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
assert.strictEqual(getApprovedShortUrl(approvedAlias), approvedAlias);
assert.strictEqual(getApprovedShortUrl('https://somebodytotalkto.com/r/PIdPiaUemocJlYbn-kavqTzLdUPFNYI4WNngIVWf0Yo'), '');
assert.strictEqual(getApprovedShortUrl('https://bit.ly/4dUqXRm'), '');
assert.strictEqual(getApprovedShortUrl('https://example.com/s/8592a7f4c6'), '');

const fitStart = source.indexOf('function fitRegistrationDisplayText');
const fitEnd = source.indexOf('function getRegistrationDisplayText', fitStart);
assert(fitStart >= 0 && fitEnd > fitStart, 'registration fit helper must be present');

const displayStart = source.indexOf('function getRegistrationDisplayText');
const displayEnd = source.indexOf('function fitSessionPromoLayout', displayStart);
assert(displayStart >= 0 && displayEnd > displayStart, 'registration display helper must be present');

const getDisplay = new Function(
  'window',
  `const MAX_REGISTRATION_DISPLAY_LENGTH = 28;
   ${source.slice(fitStart, fitEnd)}
   ${source.slice(displayStart, displayEnd)}
   return getRegistrationDisplayText;`,
)({ location: { href: 'https://askit-inc.github.io/partner-promos/' } });

const facebook = 'https://somebodytotalkto.com/r/bTsxn2r4pBGyfUFN1_9Jq4iIm1TTZBGFB7_6dp3Ts8I';
const foundation = 'https://somebodytotalkto.com/r/91jaNGQt5zgWvl8PGWkQFF_lVuVHufC_65LcRBym0Cg';
const facebookLabel = getDisplay(facebook);
const foundationLabel = getDisplay(foundation);

assert.strictEqual(getDisplay(approvedAlias), 'somebodytotalkto.com/s/8592a7f4c6');
assert.strictEqual(facebookLabel, 'somebodytotalkto.com/r/bTsx…');
assert.strictEqual(foundationLabel, 'somebodytotalkto.com/r/91ja…');
assert.notStrictEqual(facebookLabel, foundationLabel);
assert(getDisplay('https://us06web.zoom.us/meeting/register/EiYDZDaVSqKiNgaDDIMSKg').length <= 28);

console.log('partner-promos source-scoped link checks passed');
