const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('index.html', 'utf8');
const partnerHelperStart = source.indexOf('function normalizeWeeklyCalendarPartnerTids');
const partnerHelperEnd = source.indexOf('function getEmployerPartnerKey', partnerHelperStart);
assert(partnerHelperStart >= 0 && partnerHelperEnd > partnerHelperStart, 'weekly partner-list helpers must be present');
const weeklyPartnerHelpers = new Function(
  `${source.slice(partnerHelperStart, partnerHelperEnd)}
   return {
     normalizeWeeklyCalendarPartnerTids,
     resolveWeeklyCalendarPartnerTids,
     getWeeklyPartnerAvailabilityMessage,
     getWeeklyCalendarSessionsApiEndpoint,
     buildWeeklyCalendarSessionsApiUrl,
     getWeeklyCalendarUnassignedSessionsApiEndpoint,
     buildWeeklyCalendarUnassignedSessionsApiUrl,
     mergeWeeklyCalendarSessions
   };`
)();
assert.deepStrictEqual(
  weeklyPartnerHelpers.normalizeWeeklyCalendarPartnerTids([101, '202', 202, 0, -1, true, '303x', ' 303 ']),
  [101, 202, 303],
  'partner IDs must be positive safe integers, deduplicated, and ordered by the live term list',
);
assert.deepStrictEqual(
  weeklyPartnerHelpers.resolveWeeklyCalendarPartnerTids(0, [101, 202, 202, 'bad'], true),
  [101, 202],
  'partnerless weekly mode must use every eligible ID returned by the term API',
);
assert.deepStrictEqual(
  weeklyPartnerHelpers.resolveWeeklyCalendarPartnerTids(202, [101, 202], true),
  [202],
  'selected-partner weekly mode must be isolated to the selected eligible ID',
);
assert.deepStrictEqual(
  weeklyPartnerHelpers.resolveWeeklyCalendarPartnerTids(999, [101, 202], true),
  [],
  'selected partner IDs outside the live eligible list must not fall back to aggregate mode',
);
assert.deepStrictEqual(
  weeklyPartnerHelpers.resolveWeeklyCalendarPartnerTids(0, [101, 202], false),
  [],
  'partner IDs must not be used before the live term list is ready',
);
const aggregateEndpoint = weeklyPartnerHelpers.getWeeklyCalendarSessionsApiEndpoint('https://local-sttt.somebodytotalkto.com:8443');
assert.strictEqual(aggregateEndpoint, 'https://local-sttt.somebodytotalkto.com:8443/api/spotlight/microsite/sessions');
const aggregateRequest = new URL(weeklyPartnerHelpers.buildWeeklyCalendarSessionsApiUrl(aggregateEndpoint, [101, '202', 202, -1]));
assert.strictEqual(aggregateRequest.searchParams.get('partner'), '101,202', 'aggregate requests must use the complete sanitized live term ID list');
assert.strictEqual(aggregateRequest.searchParams.get('status'), 'all');
const selectedRequest = new URL(weeklyPartnerHelpers.buildWeeklyCalendarSessionsApiUrl(
  'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=101,202&indication=4,12362&status=active',
  [202],
));
assert.strictEqual(selectedRequest.searchParams.get('partner'), '202', 'selected requests must replace any configured partner list with the selected ID only');
assert.strictEqual(selectedRequest.searchParams.get('indication'), null, 'weekly requests must fetch all indication rows before applying the selected indication filter to partner and unassigned sessions');
assert.strictEqual(selectedRequest.searchParams.get('status'), 'all');
assert.strictEqual(weeklyPartnerHelpers.buildWeeklyCalendarSessionsApiUrl(aggregateEndpoint, []), '', 'empty partner lists must never produce an unfiltered request');
const unassignedEndpoint = weeklyPartnerHelpers.getWeeklyCalendarUnassignedSessionsApiEndpoint('https://local-sttt.somebodytotalkto.com:8443');
assert.strictEqual(unassignedEndpoint, 'https://local-sttt.somebodytotalkto.com:8443/api/spotlight/microsite/sessions/unassigned-week');
const unassignedRequest = new URL(weeklyPartnerHelpers.buildWeeklyCalendarUnassignedSessionsApiUrl(unassignedEndpoint, 2026, 47));
assert.strictEqual(unassignedRequest.searchParams.get('week'), '2026-W47');
assert.strictEqual(unassignedRequest.searchParams.get('card_type'), 'facebook-promo');
assert.strictEqual(weeklyPartnerHelpers.buildWeeklyCalendarUnassignedSessionsApiUrl(unassignedEndpoint, 1999, 47), '');
assert.strictEqual(weeklyPartnerHelpers.buildWeeklyCalendarUnassignedSessionsApiUrl(unassignedEndpoint, 2026, 54), '');
assert.strictEqual(weeklyPartnerHelpers.getWeeklyCalendarUnassignedSessionsApiEndpoint('http://localhost:8080'), '');
const duplicateSessionId = 'unassigned-thursday-uuid';
const mergedWeeklyRows = weeklyPartnerHelpers.mergeWeeklyCalendarSessions([
  { uuid: 'partner-monday', title: 'Monday', partner: 'Partner One' },
  { uuid: duplicateSessionId, title: 'Stale partner copy', partner: 'Partner One' }
], [
  { uuid: duplicateSessionId, title: 'Unassigned Thursday', partner: '', date: 'Thu, Nov 19, 2026' }
]);
assert.strictEqual(mergedWeeklyRows.length, 2, 'aggregate session lists must deduplicate by UUID');
assert.strictEqual(mergedWeeklyRows[1].title, 'Unassigned Thursday', 'unassigned API fields must win on a UUID collision');
assert.strictEqual(mergedWeeklyRows[1]._weeklyFromUnassignedApi, true, 'unassigned sessions must be marked for direct QR/link reuse');
assert.strictEqual(weeklyPartnerHelpers.getWeeklyPartnerAvailabilityMessage('loading', [], false), 'Loading the current promo-card-enabled partner list…');
assert(/could not be loaded/.test(weeklyPartnerHelpers.getWeeklyPartnerAvailabilityMessage('error', [], false)));
assert(/No promo-card-enabled partners/.test(weeklyPartnerHelpers.getWeeklyPartnerAvailabilityMessage('ready', [], false)));
assert(/selected partner is not currently promo-card enabled/.test(weeklyPartnerHelpers.getWeeklyPartnerAvailabilityMessage('ready', [], true)));

const bannerDefaultsStart = source.indexOf('const WEEKLY_AGGREGATE_BANNER_DEFAULTS = Object.freeze(');
const bannerDefaultsEnd = source.indexOf('\nconst WEEKLY_AGGREGATE_BANNER_STORAGE_KEY', bannerDefaultsStart);
assert(bannerDefaultsStart >= 0 && bannerDefaultsEnd > bannerDefaultsStart, 'aggregate weekly banner defaults must be present');
const weeklyBannerDefaults = new Function(
  `${source.slice(bannerDefaultsStart, bannerDefaultsEnd)} return WEEKLY_AGGREGATE_BANNER_DEFAULTS;`
)();
assert.deepStrictEqual(weeklyBannerDefaults, {
  eyebrow: 'Amyloidosis Program Spotlight Series',
  title: 'All Eligible Partners Amyloidosis Program',
  color: '#85008C'
}, 'aggregate banner defaults must match the approved copy and purple palette');
const bannerNormalizeStart = source.indexOf('function normalizeWeeklyAggregateBannerSettings');
const bannerNormalizeEnd = source.indexOf('function loadWeeklyAggregateBannerSettings', bannerNormalizeStart);
const normalizeWeeklyBanner = new Function(
  'WEEKLY_AGGREGATE_BANNER_DEFAULTS',
  `${source.slice(bannerNormalizeStart, bannerNormalizeEnd)} return normalizeWeeklyAggregateBannerSettings;`
)(weeklyBannerDefaults);
const editedBannerSettings = normalizeWeeklyBanner({ eyebrow: 'Edited eyebrow', title: 'Edited aggregate title', color: '#12abEF' });
assert.deepStrictEqual(editedBannerSettings, { eyebrow: 'Edited eyebrow', title: 'Edited aggregate title', color: '#12ABEF' });
assert.strictEqual(normalizeWeeklyBanner({ color: 'red' }).color, weeklyBannerDefaults.color, 'invalid stored colors must return to the safe default');

const bannerStorageStart = bannerNormalizeEnd;
const bannerStorageEnd = source.indexOf('function refreshWeeklyAggregateBannerControls', bannerStorageStart);
const bannerStorage = new Map();
const bannerStorageHelpers = new Function(
  'WEEKLY_AGGREGATE_BANNER_DEFAULTS',
  'WEEKLY_AGGREGATE_BANNER_STORAGE_KEY',
  'normalizeWeeklyAggregateBannerSettings',
  'window',
  'getCardScopedStorageKey',
  `let weeklyAggregateBannerSettings = { ...WEEKLY_AGGREGATE_BANNER_DEFAULTS };
   ${source.slice(bannerStorageStart, bannerStorageEnd)}
   return {
     loadWeeklyAggregateBannerSettings,
     saveWeeklyAggregateBannerSettings,
     set(settings) { weeklyAggregateBannerSettings = settings; }
   };`
)(weeklyBannerDefaults, 'weekly_aggregate_banner', normalizeWeeklyBanner, {
  localStorage: {
    getItem: key => bannerStorage.get(key) || null,
    setItem: (key, value) => bannerStorage.set(key, value)
  }
}, (key, layout) => `${key}__card__${layout}`);
bannerStorageHelpers.set(editedBannerSettings);
bannerStorageHelpers.saveWeeklyAggregateBannerSettings();
assert.deepStrictEqual(
  JSON.parse(bannerStorage.get('weekly_aggregate_banner__card__weekly-calendar-card')),
  editedBannerSettings,
  'aggregate banner settings must use the existing card-scoped storage convention',
);
assert.deepStrictEqual(
  bannerStorageHelpers.loadWeeklyAggregateBannerSettings('weekly-calendar-card'),
  editedBannerSettings,
  'saved aggregate banner settings must reload for the weekly card',
);
assert.deepStrictEqual(
  bannerStorageHelpers.loadWeeklyAggregateBannerSettings('calendar-card'),
  weeklyBannerDefaults,
  'monthly cards must not load aggregate weekly banner settings',
);

const bannerRenderStart = source.indexOf('function applyCalendarBannerSettings');
const bannerRenderEnd = source.indexOf('function syncCalendarCard', bannerRenderStart);
const makeBannerRenderer = (aggregateMode, weeklyMode = true) => {
  const elements = {
    'calendar-series-label': { textContent: '' },
    'calendar-program-title': { textContent: '' },
    banner: { style: { backgroundColor: '', variables: {}, setProperty(key, value) { this.variables[key] = value; } } }
  };
  const render = new Function(
    'document',
    'isWeeklyCalendarAggregateMode',
    'isWeeklyCalendarCardLayout',
    `${source.slice(bannerRenderStart, bannerRenderEnd)} return applyCalendarBannerSettings;`
  )({
    getElementById: id => elements[id],
    querySelector: selector => selector === '.calendar-spotlight-band' ? elements.banner : null
  }, () => aggregateMode, () => weeklyMode);
  return { elements, render };
};
const aggregateBannerRenderer = makeBannerRenderer(true);
aggregateBannerRenderer.render({
  seriesLabel: editedBannerSettings.eyebrow,
  programTitle: editedBannerSettings.title,
  bannerColor: editedBannerSettings.color
});
assert.strictEqual(aggregateBannerRenderer.elements['calendar-series-label'].textContent, editedBannerSettings.eyebrow);
assert.strictEqual(aggregateBannerRenderer.elements['calendar-program-title'].textContent, editedBannerSettings.title);
assert.strictEqual(aggregateBannerRenderer.elements.banner.style.variables['--weekly-banner-color'], editedBannerSettings.color);
assert.strictEqual(aggregateBannerRenderer.elements.banner.style.backgroundColor, 'transparent');
const selectedBannerRenderer = makeBannerRenderer(false);
selectedBannerRenderer.render({
  seriesLabel: 'Partner Spotlight Series',
  programTitle: 'Selected Partner Amyloidosis Program',
  bannerColor: editedBannerSettings.color
}, '#0057B8');
assert.strictEqual(selectedBannerRenderer.elements['calendar-series-label'].textContent, 'Partner Spotlight Series');
assert.strictEqual(selectedBannerRenderer.elements['calendar-program-title'].textContent, 'Selected Partner Amyloidosis Program');
assert.strictEqual(selectedBannerRenderer.elements.banner.style.variables['--weekly-banner-color'], '#85008C', 'selected partner mode must use the campaign purple');
const monthlyBannerRenderer = makeBannerRenderer(false, false);
monthlyBannerRenderer.render({ seriesLabel: 'Monthly Series', programTitle: 'Monthly Partner' }, '#0057B8');
assert.strictEqual(monthlyBannerRenderer.elements.banner.style.backgroundColor, '#0057B8', 'monthly partner banner colors must remain unchanged');
assert(source.includes("? { primary: '#85008C', borderAccent: '#DCC1DF' }"), 'weekly banner edits must not recolor date panels or other campaign accents');
assert(source.includes('id="weekly-banner-eyebrow" type="text"'));
assert(source.includes('id="weekly-banner-title" type="text"'));
assert(source.includes('id="weekly-banner-color" type="color"'));
assert(source.includes("input?.addEventListener('input', () => setWeeklyAggregateBannerSetting(key, input.value))"), 'banner input changes must be wired to the live preview updater');
assert(source.includes('? weeklyAggregateBannerSettings.title'), 'aggregate weekly post text must use the editable banner title');
assert(source.includes('const pngDataUrl = await domtoimage.toPng(surface, {'), 'PNG export must capture the same surface updated by the banner renderer');
assert(source.includes('width: pxW, height: pxH,'), 'the PNG renderer must use the configured 1440 × 1800 export dimensions');
assert(source.includes('return isWeeklyCalendarCardLayout() ? addPngDpiMetadata(pngDataUrl, 300) : pngDataUrl;'), 'weekly exports must include 300-DPI metadata where supported');
assert(source.includes('<div class="calendar-spotlight-band">'), 'the banner being rendered must be part of the exported card surface');

const bannerSetterStart = source.indexOf('function setWeeklyAggregateBannerSetting');
const bannerSetterEnd = source.indexOf('function loadSelectedHeaderLogos', bannerSetterStart);
let bannerSaveCalls = 0;
let bannerRefreshCalls = 0;
let bannerSyncCalls = 0;
let bannerPostRefreshCalls = 0;
const bannerSetterHarness = new Function(
  'isWeeklyCalendarAggregateMode',
  'normalizeWeeklyAggregateBannerSettings',
  'saveWeeklyAggregateBannerSettings',
  'refreshWeeklyAggregateBannerControls',
  'syncCalendarCard',
  'refreshWeeklyCalendarPostPanel',
  'initialSettings',
  `let weeklyAggregateBannerSettings = initialSettings;
   ${source.slice(bannerSetterStart, bannerSetterEnd)}
   return {
     setWeeklyAggregateBannerSetting,
     getSettings: () => weeklyAggregateBannerSettings
   };`
)(() => true, normalizeWeeklyBanner, () => { bannerSaveCalls++; }, () => { bannerRefreshCalls++; }, () => { bannerSyncCalls++; }, () => { bannerPostRefreshCalls++; }, { ...weeklyBannerDefaults });
bannerSetterHarness.setWeeklyAggregateBannerSetting('title', 'Edited live title');
assert.strictEqual(bannerSetterHarness.getSettings().title, 'Edited live title');
assert.deepStrictEqual([bannerSaveCalls, bannerRefreshCalls, bannerSyncCalls, bannerPostRefreshCalls], [1, 1, 1, 1], 'aggregate title edits must refresh both the poster and generated post text');
const selectedBannerSetter = new Function(
  'isWeeklyCalendarAggregateMode',
  'normalizeWeeklyAggregateBannerSettings',
  'saveWeeklyAggregateBannerSettings',
  'refreshWeeklyAggregateBannerControls',
  'syncCalendarCard',
  'refreshWeeklyCalendarPostPanel',
  'initialSettings',
  `let weeklyAggregateBannerSettings = initialSettings;
   ${source.slice(bannerSetterStart, bannerSetterEnd)}
   return { setWeeklyAggregateBannerSetting, getSettings: () => weeklyAggregateBannerSettings };`
)(() => false, normalizeWeeklyBanner, () => { bannerSaveCalls++; }, () => { bannerRefreshCalls++; }, () => { bannerSyncCalls++; }, () => { bannerPostRefreshCalls++; }, { ...weeklyBannerDefaults });
selectedBannerSetter.setWeeklyAggregateBannerSetting('title', 'Must not leak');
assert.deepStrictEqual(selectedBannerSetter.getSettings(), weeklyBannerDefaults, 'partner-selected mode must ignore aggregate banner edits');
assert.deepStrictEqual([bannerSaveCalls, bannerRefreshCalls, bannerSyncCalls, bannerPostRefreshCalls], [1, 1, 1, 1]);

const bannerVisibilityStart = source.indexOf('function shouldShowWeeklyAggregateBannerControls');
const bannerVisibilityEnd = source.indexOf('function isAnyCalendarCardLayout', bannerVisibilityStart);
const shouldShowAggregateBannerControls = new Function(
  'hasReadySelection',
  'isWeeklyCalendarAggregateMode',
  `${source.slice(bannerVisibilityStart, bannerVisibilityEnd)} return shouldShowWeeklyAggregateBannerControls;`
);
assert.strictEqual(shouldShowAggregateBannerControls(() => true, () => true)(), true);
assert.strictEqual(shouldShowAggregateBannerControls(() => true, () => false)(), false, 'partner-selected cards must hide aggregate banner controls');
assert.strictEqual(shouldShowAggregateBannerControls(() => false, () => true)(), false, 'unselected cards must hide aggregate banner controls');

const promoLoaderStart = source.indexOf('async function loadPromoEmployers()');
const promoLoaderEnd = source.indexOf('function loadSelectedPartnerKey', promoLoaderStart);
assert(promoLoaderStart >= 0 && promoLoaderEnd > promoLoaderStart, 'live promo-enabled employer term loader must be present');
const makePromoTermsLoader = (fetchResponse) => {
  const initialPartnerConfigs = { partners: { stale: { promoCardEnabled: true } } };
  const fetchMock = async () => {
    if (fetchResponse instanceof Error) throw fetchResponse;
    return fetchResponse;
  };
  return new Function(
    'fetch',
    'EMPLOYERS_API_URL',
    'partnerConfigs',
    'getEmployerPartnerKey',
    'getTimezoneCode',
    'normalizeWeeklyCalendarPartnerTids',
    `${source.slice(promoLoaderStart, promoLoaderEnd)}
     return {
       loadPromoEmployers,
       partnerConfigs,
       getState: () => ({ promoPartnerTermsStatus, livePromoPartnerTids })
     };`
  )(fetchMock, 'https://example.test/jsonapi/taxonomy_term/employer', initialPartnerConfigs,
    term => String(term.attributes.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    () => 'ET', weeklyPartnerHelpers.normalizeWeeklyCalendarPartnerTids);
};
const promoTermsChecks = async () => {
  const loader = makePromoTermsLoader({
    ok: true,
    json: async () => ({ data: [
      { attributes: { name: 'Partner One', drupal_internal__tid: 101, field_promo_card_enabled: true } },
      { attributes: { name: 'Disabled Partner', drupal_internal__tid: 909, field_promo_card_enabled: false } },
      { attributes: { name: 'Partner Two', drupal_internal__tid: '202', field_promo_card_enabled: true } }
    ] })
  });
  await loader.loadPromoEmployers();
  assert.deepStrictEqual(loader.getState(), { promoPartnerTermsStatus: 'ready', livePromoPartnerTids: [101, 202] }, 'the weekly partner list must be built from only live promo-enabled JSON:API terms');
  assert.strictEqual(loader.partnerConfigs.partners.stale.promoCardEnabled, false, 'terms absent from the live response must lose stale local eligibility');
  assert.strictEqual(loader.partnerConfigs.partners['partner-one'].partnerTid, 101);
  assert.strictEqual(loader.partnerConfigs.partners['partner-two'].partnerTid, 202);

  const failedLoader = makePromoTermsLoader(new Error('Employer API unavailable'));
  await assert.rejects(failedLoader.loadPromoEmployers(), /Employer API unavailable/);
  assert.deepStrictEqual(failedLoader.getState(), { promoPartnerTermsStatus: 'loading', livePromoPartnerTids: [] }, 'a failed term request must clear previously held IDs before its caller marks the error');
  const missingTermsLoader = makePromoTermsLoader({ ok: true, json: async () => ({}) });
  await assert.rejects(missingTermsLoader.loadPromoEmployers(), /did not include a term list/);
  assert.deepStrictEqual(missingTermsLoader.getState(), { promoPartnerTermsStatus: 'loading', livePromoPartnerTids: [] }, 'a missing JSON:API data list must fail closed without stale IDs');

  const partnerConfigStart = source.indexOf('async function loadPartnerConfigs()');
  const partnerConfigEnd = source.indexOf('function isPartnerBackLayout', partnerConfigStart);
  const partnerConfigSource = source.slice(partnerConfigStart, partnerConfigEnd);
  assert(partnerConfigSource.includes("promoPartnerTermsStatus = 'error';"), 'a failed live term request must become a clear partner-list error');
  assert(partnerConfigSource.includes('livePromoPartnerTids = [];'), 'failed live term requests must not keep stale partner IDs');
};

const calendarConfigStart = source.indexOf('function getCalendarConfig()');
const calendarConfigEnd = source.indexOf('function getAllCalendarSessionsApiUrl', calendarConfigStart);
assert(calendarConfigStart >= 0 && calendarConfigEnd > calendarConfigStart, 'weekly and monthly calendar API config must be present');
const createCalendarConfig = (partner, weekly, aggregate, bannerSettings = weeklyBannerDefaults) => new Function(
  'activePartnerConfig',
  'CALENDAR_DEFAULT_CONFIG',
  'isWeeklyCalendarAggregateMode',
  'isWeeklyCalendarCardLayout',
  'getWeeklyCalendarSessionsApiUrl',
  'getProfilesApiUrlForSessions',
  'weeklyAggregateBannerSettings',
  'normalizeWeeklyAggregateBannerSettings',
  `${source.slice(calendarConfigStart, calendarConfigEnd)} return getCalendarConfig;`
)(partner, { programTitle: 'Calendar', seriesLabel: 'Default Series', sessionsApiUrl: '', profilesApiUrl: '', micrositeUrl: '' },
  () => aggregate, () => weekly,
  configuredUrl => aggregate
    ? 'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=101,202&status=all'
    : configuredUrl,
  () => 'https://somebodytotalkto.com/api/spotlight/microsite/profiles?partner=101,202',
  bannerSettings,
  normalizeWeeklyBanner);
const monthlyConfig = createCalendarConfig({
  label: 'Monthly Partner',
  sessionsApiUrl: 'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=303&status=all',
  micrositeUrl: 'monthly.example',
  calendar: { profilesApiUrl: 'https://somebodytotalkto.com/api/spotlight/microsite/profiles?partner=303' }
}, false, false)();
assert.strictEqual(monthlyConfig.sessionsApiUrl, 'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=303&status=all', 'monthly cards must retain their configured partner sessions URL');
assert.strictEqual(monthlyConfig.profilesApiUrl, 'https://somebodytotalkto.com/api/spotlight/microsite/profiles?partner=303');
assert.strictEqual(monthlyConfig.micrositeUrl, 'monthly.example');
assert.strictEqual(monthlyConfig.programTitle, 'Monthly Partner Amyloidosis Program');
assert.strictEqual(monthlyConfig.seriesLabel, 'Default Series');
assert.strictEqual(monthlyConfig.bannerColor, '', 'monthly cards must not consume aggregate banner color settings');
const aggregateConfig = createCalendarConfig({
  label: 'University of Chicago',
  sessionsApiUrl: 'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=404',
  micrositeUrl: 'uchicago.example',
  calendar: { profilesApiUrl: 'https://somebodytotalkto.com/api/spotlight/microsite/profiles?partner=404' }
}, true, true)();
assert.strictEqual(aggregateConfig.programTitle, 'All Eligible Partners Amyloidosis Program');
assert.strictEqual(aggregateConfig.seriesLabel, 'Amyloidosis Program Spotlight Series');
assert.strictEqual(aggregateConfig.bannerColor, '#85008C');
assert.strictEqual(aggregateConfig.sessionsApiUrl, 'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=101,202&status=all', 'aggregate weekly config must use only the live eligible partner list');
assert.strictEqual(aggregateConfig.profilesApiUrl, 'https://somebodytotalkto.com/api/spotlight/microsite/profiles?partner=101,202');
assert.strictEqual(aggregateConfig.micrositeUrl, '', 'aggregate weekly config must not reuse the fallback partner microsite');
const editedAggregateConfig = createCalendarConfig({ label: 'Fallback Partner' }, true, true, editedBannerSettings)();
assert.strictEqual(editedAggregateConfig.seriesLabel, 'Edited eyebrow');
assert.strictEqual(editedAggregateConfig.programTitle, 'Edited aggregate title');
assert.strictEqual(editedAggregateConfig.bannerColor, '#12ABEF', 'edited banner color must reach the calendar render config');
const selectedWeeklyConfig = createCalendarConfig({
  label: 'Selected Partner',
  sessionsApiUrl: 'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=404&status=all',
  micrositeUrl: 'selected.example',
  calendar: { seriesLabel: 'Partner Spotlight Series', profilesApiUrl: 'https://somebodytotalkto.com/api/spotlight/microsite/profiles?partner=404' }
}, true, false, editedBannerSettings)();
assert.strictEqual(selectedWeeklyConfig.programTitle, 'Selected Partner Amyloidosis Program');
assert.strictEqual(selectedWeeklyConfig.seriesLabel, 'Partner Spotlight Series');
assert.strictEqual(selectedWeeklyConfig.bannerColor, '', 'selected partner mode must ignore aggregate banner settings');
assert.strictEqual(selectedWeeklyConfig.micrositeUrl, 'selected.example');

const dateStart = source.indexOf('function calendarParseApiDate');
const dateEnd = source.indexOf('function calendarMatchesSelectedRange', dateStart);
assert(dateStart >= 0 && dateEnd > dateStart, 'weekly date helpers must be present');

const monthIndex = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
};
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const normalizeSpaces = value => String(value || '').replace(/\s+/g, ' ').trim();
const weeklyHelpers = new Function(
  'CALENDAR_MONTH_INDEX',
  'CALENDAR_DAY_NAMES',
  'calendarNormalizeSpaces',
  'selectedWeeklyYear',
  'selectedWeeklyWeek',
  'selectedWeeklyDays',
  'selectedWeeklyIndication',
  `${source.slice(dateStart, dateEnd)}
   return {
     calendarGetIsoWeekFromDate,
     calendarGetIsoWeekStartUtc,
     calendarGetIsoWeeksInYear,
     calendarFormatWeeklyRange,
     calendarFormatWeeklyWeekOption,
     getWeeklyCalendarWeekOptions,
     calendarGetWeeklyLabel,
     calendarGetWeeklySessions,
     getWeeklyCalendarSessionIndications,
     getWeeklyCalendarIndicationOptions
   };`
)(monthIndex, dayNames, normalizeSpaces, 2026, 47, new Set(['Mon', 'Sun']), 'all');

assert.deepStrictEqual(
  weeklyHelpers.calendarGetIsoWeekFromDate(new Date(Date.UTC(2021, 0, 1))),
  { year: 2020, week: 53 },
  'January 1 must belong to the prior ISO year when appropriate',
);
assert.strictEqual(weeklyHelpers.calendarGetIsoWeeksInYear(2020), 53);
assert.strictEqual(weeklyHelpers.calendarGetIsoWeeksInYear(2021), 52);
assert.strictEqual(weeklyHelpers.calendarGetIsoWeekStartUtc(2021, 1).toISOString(), '2021-01-04T00:00:00.000Z');
assert.strictEqual(weeklyHelpers.calendarFormatWeeklyRange(2026, 47), 'Nov 16–22, 2026');
assert.strictEqual(weeklyHelpers.calendarFormatWeeklyRange(2020, 53), 'Dec 28, 2020 – Jan 3, 2021');
assert.strictEqual(weeklyHelpers.calendarFormatWeeklyWeekOption(2026, 44), 'Oct 26–Nov 1 (Week 44)');
assert.strictEqual(weeklyHelpers.calendarFormatWeeklyWeekOption(2026, 46), 'Nov 9–15 (Week 46)');
assert.strictEqual(weeklyHelpers.calendarFormatWeeklyWeekOption(2020, 53), 'Dec 28–Jan 3 (Week 53)');
assert.deepStrictEqual(
  weeklyHelpers.getWeeklyCalendarWeekOptions(2026, 'nov 9', { year: 2026, week: 46 }).map(option => option.week),
  [46],
  'searching by date text must find the matching ISO week'
);
assert.deepStrictEqual(
  weeklyHelpers.getWeeklyCalendarWeekOptions(2026, '2026', { year: 2026, week: 46 }).map(option => option.week),
  Array.from({ length: weeklyHelpers.calendarGetIsoWeeksInYear(2026) - 45 }, (_, index) => index + 46),
  'week search must include only upcoming weeks in the selected ISO year'
);
assert.deepStrictEqual(
  weeklyHelpers.getWeeklyCalendarWeekOptions(2026, 'week 45', { year: 2026, week: 46 }),
  [],
  'past weeks in the current ISO year must not be searchable'
);
assert.deepStrictEqual(
  weeklyHelpers.getWeeklyCalendarWeekOptions(2025, '', { year: 2026, week: 46 }),
  [],
  'past ISO years must not expose week options'
);
const filterWeek47Sessions = new Function(
  'CALENDAR_MONTH_INDEX',
  'CALENDAR_DAY_NAMES',
  'calendarNormalizeSpaces',
  'selectedWeeklyYear',
  'selectedWeeklyWeek',
  'selectedWeeklyDays',
  'selectedWeeklyIndication',
  `${source.slice(dateStart, dateEnd)} return calendarGetWeeklySessions;`
)(monthIndex, dayNames, normalizeSpaces, 2026, 47, new Set(['Mon', 'Tue', 'Wed', 'Thu']), 'Amyloidosis');
const week47PartnerRows = [
  { uuid: 'monday', title: 'Monday session', partner: 'Partner One', date: 'Nov 16, 2026', timestamp: Date.UTC(2026, 10, 16), indications: ['Patient Best Practices', 'Amyloidosis'] },
  { uuid: 'tuesday', title: 'Tuesday session', partner: 'Partner Two', date: 'Nov 17, 2026', timestamp: Date.UTC(2026, 10, 17), indications: ['Amyloidosis'] },
  { uuid: 'wednesday', title: 'Wednesday session', partner: 'Partner Three', date: 'Nov 18, 2026', timestamp: Date.UTC(2026, 10, 18), indications: ['Amyloidosis'] }
];
const week47UnassignedSickleCell = {
  uuid: 'unassigned-sickle-cell-wednesday',
  title: 'Sickle cell session',
  partner: '',
  date: 'Nov 18, 2026',
  timestamp: Date.UTC(2026, 10, 18),
  indications: ['Sickle Cell Disease']
};
const week47UnassignedThursday = {
  uuid: 'unassigned-thursday-uuid',
  title: 'Sadness, Anger and Fear: Coping With the Emotions of Illness',
  partner: '',
  date: 'Nov 19, 2026',
  timestamp: Date.UTC(2026, 10, 19),
  indications: ['Relationship Support', 'Amyloidosis', 'Rare Disease', 'Sickle Cell Disease'],
  qr_payload_url: 'https://somebodytotalkto.com/s/thu123abc456',
  tracked_registration_url: 'https://somebodytotalkto.com/r/' + 'a'.repeat(43),
  qr_base64: 'data:image/png;base64,VGh1cnNkYXlRUi0='
};
const week47Rows = weeklyPartnerHelpers.mergeWeeklyCalendarSessions(week47PartnerRows, [week47UnassignedSickleCell, week47UnassignedThursday]);
const filteredWeek47Rows = filterWeek47Sessions(week47Rows);
const allWeek47Rows = filterWeek47Sessions(week47Rows, 'all');
assert.deepStrictEqual(
  weeklyHelpers.getWeeklyCalendarIndicationOptions(week47Rows),
  ['Amyloidosis', 'Patient Best Practices', 'Rare Disease', 'Relationship Support', 'Sickle Cell Disease'],
  'weekly indication options must come from the current week while keeping Amyloidosis available by default'
);
assert.deepStrictEqual(filteredWeek47Rows.map(row => row.uuid), [
  'monday', 'tuesday', 'wednesday', 'unassigned-thursday-uuid'
], 'the aggregate weekly card must merge the bounded Thursday session into ISO week 47');
const week47PageSizeMatch = source.match(/const WEEKLY_CALENDAR_PAGE_SIZE = (\d+);/);
const week47PageSize = Number(week47PageSizeMatch && week47PageSizeMatch[1]);
const week47Pages = Array.from({ length: Math.ceil(filteredWeek47Rows.length / week47PageSize) }, (_, index) =>
  filteredWeek47Rows.slice(index * week47PageSize, (index + 1) * week47PageSize));
assert.strictEqual(week47PageSize, 4, 'weekly cards must fit up to four selected sessions per card');
assert.strictEqual(filteredWeek47Rows.length, 4, 'Amyloidosis must include four matching partner and unassigned sessions');
assert.strictEqual(week47Pages.length, 1, 'all four Amyloidosis sessions must appear on one card');
assert.deepStrictEqual(week47Pages[0].map(row => row.uuid), [
  'monday', 'tuesday', 'wednesday', 'unassigned-thursday-uuid'
], 'the Amyloidosis card must include Monday through Thursday in date order');
assert.strictEqual(allWeek47Rows.length, 5, 'All Indications must keep the additional Sickle Cell session available');
assert.strictEqual(Math.ceil(allWeek47Rows.length / week47PageSize), 2, 'additional all-indication sessions must paginate after the first four');
assert.strictEqual(week47Pages[0][3].partner, '', 'the unassigned Thursday has no invented partner');
assert.strictEqual(week47Pages[0][3]._weeklyFromUnassignedApi, true);
assert.strictEqual(weeklyHelpers.getWeeklyCalendarWeekOptions(2020, '', { year: 2020, week: 53 })[0].week, 53);
assert.strictEqual(weeklyHelpers.getWeeklyCalendarWeekOptions(2021, '', { year: 2021, week: 52 })[0].week, 52);
assert.strictEqual(weeklyHelpers.getWeeklyCalendarWeekOptions(2027, '', { year: 2026, week: 46 }).length, 52);
assert(source.includes('id="weekly-calendar-week-search" class="weekly-calendar-week-search" type="search"'));
assert(source.includes('role="listbox" aria-label="Weekly date ranges"'));
assert(source.includes("weeklyCalendarWeekSearch?.addEventListener('input', refreshWeeklyCalendarWeekPicker)"));
assert(source.includes("event.key === 'ArrowDown'"), 'the searchable week picker must support keyboard selection');
const weeklyLogoHelperStart = source.indexOf('function getWeeklyCalendarLogoVisibility');
const weeklyLogoHelperEnd = source.indexOf('function syncCalendarCard', weeklyLogoHelperStart);
assert(weeklyLogoHelperStart >= 0 && weeklyLogoHelperEnd > weeklyLogoHelperStart, 'weekly logo visibility helper must be present');
const getWeeklyCalendarLogoVisibility = new Function(
  `${source.slice(weeklyLogoHelperStart, weeklyLogoHelperEnd)} return getWeeklyCalendarLogoVisibility;`
)();
assert.deepStrictEqual(
  getWeeklyCalendarLogoVisibility([true, true, true], true),
  [true, true, true],
  'aggregate weekly cards must expose all three selectable shared logo slots'
);
assert.deepStrictEqual(
  getWeeklyCalendarLogoVisibility([true, false, true], false),
  [true, false, true],
  'partner weekly cards must preserve selected logos and leave empty slots hidden'
);
assert(source.includes("calendarLogoBar.style.display = noVisibleLogos ? 'none' : ''"), 'an empty weekly logo bar must collapse');
assert(source.includes("slot.querySelector('.calendar-logo-placeholder')?.classList.remove('visible')"), 'empty weekly logo placeholders must be hidden');
assert(source.includes('divider.style.display = logoVisibility[index] && logoVisibility[index + 1] ? \'\' : \'none\''), 'weekly separators must appear only between selected logos');
const pickerRefreshStart = source.indexOf('function refreshWeeklyCalendarWeekPicker');
const pickerRefreshEnd = source.indexOf('function setWeeklyCalendarWeekPickerOpen', pickerRefreshStart);
const pickerValue = { textContent: '' };
const pickerSearch = { value: '' };
const pickerEmpty = { hidden: true };
const pickerOptionList = {
  items: [],
  replaceChildren() { this.items = []; },
  appendChild(option) { this.items.push(option); }
};
const pickerRefresh = new Function(
  'weeklyCalendarWeekValue',
  'weeklyCalendarWeekOptions',
  'weeklyCalendarWeekSearch',
  'weeklyCalendarWeekEmpty',
  'weeklyCalendarYearInput',
  'calendarGetCurrentIsoWeek',
  'calendarFormatWeeklyWeekOption',
  'getWeeklyCalendarWeekOptions',
  'selectedWeeklyYear',
  'selectedWeeklyWeek',
  'document',
  `${source.slice(pickerRefreshStart, pickerRefreshEnd)} return refreshWeeklyCalendarWeekPicker;`
)(pickerValue, pickerOptionList, pickerSearch, pickerEmpty, { value: '', min: '' }, () => ({ year: 2026, week: 46 }),
  weeklyHelpers.calendarFormatWeeklyWeekOption,
  (year, query) => weeklyHelpers.getWeeklyCalendarWeekOptions(year, query, { year: 2026, week: 46 }),
  2026, 46, {
    createElement: () => ({
      dataset: {},
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; }
    })
  });
pickerRefresh();
assert.strictEqual(pickerValue.textContent, 'Nov 9–15 (Week 46)');
assert.strictEqual(pickerOptionList.items.length, weeklyHelpers.calendarGetIsoWeeksInYear(2026) - 45);
assert.strictEqual(pickerOptionList.items.find(option => option.dataset.week === '46').attributes['aria-selected'], 'true');
pickerSearch.value = 'Nov 9';
pickerRefresh();
assert.deepStrictEqual(pickerOptionList.items.map(option => option.textContent), ['Nov 9–15 (Week 46)']);
assert.strictEqual(pickerEmpty.hidden, true);
pickerSearch.value = 'no matching week';
pickerRefresh();
assert.strictEqual(pickerOptionList.items.length, 0);
assert.strictEqual(pickerEmpty.hidden, false);
const pickerOpenStart = source.indexOf('function setWeeklyCalendarWeekPickerOpen');
const pickerOpenEnd = source.indexOf('function setWeeklyCalendarPeriod', pickerOpenStart);
const pickerMenu = { hidden: true };
const pickerTrigger = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
let pickerFocusCalls = 0;
const pickerSearchForOpen = { value: 'old search', focus() { pickerFocusCalls++; } };
const setWeekPickerOpen = new Function(
  'weeklyCalendarWeekTrigger',
  'weeklyCalendarWeekMenu',
  'weeklyCalendarWeekSearch',
  'refreshWeeklyCalendarWeekPicker',
  `${source.slice(pickerOpenStart, pickerOpenEnd)} return setWeeklyCalendarWeekPickerOpen;`
)(pickerTrigger, pickerMenu, pickerSearchForOpen, () => {});
setWeekPickerOpen(true, true);
assert.strictEqual(pickerMenu.hidden, false);
assert.strictEqual(pickerTrigger.attributes['aria-expanded'], 'true');
assert.strictEqual(pickerSearchForOpen.value, '');
assert.strictEqual(pickerFocusCalls, 1);
setWeekPickerOpen(false);
assert.strictEqual(pickerMenu.hidden, true);
assert.strictEqual(pickerTrigger.attributes['aria-expanded'], 'false');
assert.strictEqual(weeklyHelpers.calendarGetWeeklyLabel(2026, 47), 'Week 47 · Nov 16–22, 2026');

const matchingSessions = weeklyHelpers.calendarGetWeeklySessions([
  { uuid: 'sun', partner: 'Partner Two', date: 'Nov 22, 2026', timestamp: 6 },
  { uuid: 'outside', partner: 'Partner One', date: 'Nov 23, 2026', timestamp: 7 },
  { uuid: 'tue', partner: 'Partner One', date: 'Nov 17, 2026', timestamp: 1 },
  { uuid: 'wed', partner: 'Partner Two', date: 'Nov 18, 2026', timestamp: 2 },
  { uuid: 'mon', partner: 'Partner One', date: 'Nov 16, 2026', timestamp: 0 },
]);
assert.deepStrictEqual(matchingSessions.map(session => session.uuid), ['mon', 'sun']);
assert.deepStrictEqual(matchingSessions.map(session => session.partner), ['Partner One', 'Partner Two'], 'weekly day filters must retain matching sessions from multiple partner IDs');
assert.deepStrictEqual(
  weeklyHelpers.calendarGetWeeklySessions([{ uuid: 'tue-only', partner: 'Partner One', date: 'Nov 17, 2026', timestamp: 1 }]),
  [],
  'a selected ISO week with no matching selected weekdays must return no sessions',
);
assert(source.includes('No calendar sessions${indicationLabel} match the selected ISO week and days.'), 'empty weekly indication filters must show the selected indication in the no-results state');

const weekPageStart = source.indexOf('function setWeeklyCalendarPeriod');
const weekPageEnd = source.indexOf('function initializeWeeklyCalendarControls', weekPageStart);
assert(weekPageStart >= 0 && weekPageEnd > weekPageStart, 'weekly period and pagination state handlers must be present');
let weeklyRenders = 0;
const weekPageHarness = new Function(
  'calendarGetIsoWeeksInYear',
  'calendarGetCurrentIsoWeek',
  'calendarGetWeeklySessions',
  'getWeeklyCalendarSessionPool',
  'WEEKLY_CALENDAR_PAGE_SIZE',
  'updateWeeklyCalendarRangeLabel',
  'refreshWeeklyCalendarWeekPicker',
  'renderWeeklyCalendarSessions',
  `let selectedWeeklyYear = 2026;
   let selectedWeeklyWeek = 47;
   let selectedWeeklyPage = 2;
   let calendarSessionsLoaded = true;
   let calendarSessionsData = { sessions: Array.from({ length: 6 }, (_, index) => ({ uuid: String(index) })) };
   let weeklyCalendarYearInput = { value: '' };
   let weeklyAggregateBannerSettings = ${JSON.stringify(editedBannerSettings)};
   function isWeeklyCalendarCardLayout() { return true; }
   ${source.slice(weekPageStart, weekPageEnd)}
   return {
     setWeeklyCalendarPeriod,
     setWeeklyCalendarPage,
     getState: () => ({ year: selectedWeeklyYear, week: selectedWeeklyWeek, page: selectedWeeklyPage, yearMin: weeklyCalendarYearInput.min, banner: weeklyAggregateBannerSettings })
   };`
)(year => year === 2026 ? 53 : 52, () => ({ year: 2026, week: 46 }), sessions => sessions,
  () => Array.from({ length: 6 }, (_, index) => ({ uuid: String(index) })), 3, () => {}, () => {}, () => { weeklyRenders++; });
weekPageHarness.setWeeklyCalendarPeriod(2027, 4);
weekPageHarness.setWeeklyCalendarPage(1);
assert.deepStrictEqual(weekPageHarness.getState(), {
  year: 2027,
  week: 4,
  page: 1,
  yearMin: '2026',
  banner: editedBannerSettings
}, 'banner edits must survive ISO week changes and pagination within the editing session');
assert.strictEqual(weeklyRenders, 2);
weekPageHarness.setWeeklyCalendarPeriod(2026, 45);
assert.strictEqual(weekPageHarness.getState().week, 46, 'selecting a past week in the current ISO year must clamp to the current week');
assert.strictEqual(weeklyRenders, 3);
weekPageHarness.setWeeklyCalendarPeriod(2025, 10);
assert.deepStrictEqual(weekPageHarness.getState(), {
  year: 2026,
  week: 46,
  page: 0,
  yearMin: '2026',
  banner: editedBannerSettings
}, 'changing to a past year must clamp to the current upcoming ISO week');
assert.strictEqual(weeklyRenders, 4);

const timezoneStart = source.indexOf('function getWeeklyTimezoneLabel');
const timezoneEnd = source.indexOf('function getWeeklyPostPageKey', timezoneStart);
assert(timezoneStart >= 0 && timezoneEnd > timezoneStart, 'weekly timezone, multi-zone, and caption helpers must be present');
const weeklyTimeZones = {
  ET: { short: 'ET', city: 'New York', apiKey: 'ET' },
  CT: { short: 'CT', city: 'Chicago', apiKey: 'CT' },
  MT: { short: 'MT', city: 'Denver', apiKey: 'MT' },
  PT: { short: 'PT', city: 'Los Angeles', apiKey: 'PT' }
};
const weeklyTimeHelpers = new Function(
  'TIMEZONE_OPTIONS',
  'selectedTimezone',
  'weeklyTimezoneDisplayMode',
  'calendarNormalizeSpaces',
  'cleanTimeValue',
  'calendarFormatWeeklySessionDate',
  'isWeeklyCalendarAggregateMode',
  'window',
  'DEFAULT_HEADSHOT_SIZE',
  `${source.slice(timezoneStart, timezoneEnd)}
   return {
     getWeeklyTimezoneLabel,
     getWeeklySessionTimes,
     getWeeklySessionCardColor,
     getWeeklyPresenterPhotoSize,
     renderWeeklySessionTimes,
     getWeeklySessionCaptionLines
   };`
)({
  ...weeklyTimeZones
}, 'PT', 'abbreviation', normalizeSpaces,
value => String(value || '').trim().replace(/\s+(ET|CT|MT|PT)$/i, '').trim(),
session => session.date,
() => false,
{ CSS: { supports: (property, value) => property === 'color' && /^#[\da-f]{3,8}$/i.test(value) } },
'94');
assert.strictEqual(weeklyTimeHelpers.getWeeklyTimezoneLabel('PT'), 'PT');
assert.strictEqual(weeklyTimeHelpers.getWeeklyTimezoneLabel('PT', 'location'), 'PT · Los Angeles');
const fourZoneSession = {
  uuid: 'four-zones',
  title: 'Example session',
  partner: 'Partner Two',
  date: 'Monday, November 16, 2026',
  times_by_zone: { ET: '11:00 AM', CT: '10:00 AM', MT: '9:00 AM', PT: '8:00 AM' },
  weekly_short_url: 'https://somebodytotalkto.com/s/abc123def0'
};
assert.deepStrictEqual(
  weeklyTimeHelpers.getWeeklySessionTimes(fourZoneSession),
  [
    { zone: 'ET', label: 'ET', time: '11:00 AM' },
    { zone: 'CT', label: 'CT', time: '10:00 AM' },
    { zone: 'MT', label: 'MT', time: '9:00 AM' },
    { zone: 'PT', label: 'PT', time: '8:00 AM' }
  ],
  'weekly cards must render every available ET, CT, MT, and PT time in order',
);
const locationModeHelpers = new Function(
  'TIMEZONE_OPTIONS',
  'selectedTimezone',
  'weeklyTimezoneDisplayMode',
  'calendarNormalizeSpaces',
  'cleanTimeValue',
  'calendarFormatWeeklySessionDate',
  'isWeeklyCalendarAggregateMode',
  'window',
  `${source.slice(timezoneStart, timezoneEnd)} return { getWeeklySessionTimes, renderWeeklySessionTimes };`
)({ ...weeklyTimeZones }, 'ET', 'location', normalizeSpaces,
  value => String(value || '').trim().replace(/\s+(ET|CT|MT|PT)$/i, '').trim(),
  session => session.date,
  () => false,
  { CSS: { supports: () => true } });
const makeTimeLineDocument = () => ({
  createElement: tag => ({
    tag,
    className: '',
    textContent: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  })
});
const renderWeeklyTimes = (helpers, session) => {
  const container = {
    children: [],
    replaceChildren() { this.children = []; },
    appendChild(element) { this.children.push(element); }
  };
  const render = new Function(
    'document',
    'getWeeklySessionTimes',
    `${source.slice(source.indexOf('function renderWeeklySessionTimes'), source.indexOf('function getWeeklySessionCaptionLines'))}
     return renderWeeklySessionTimes;`
  )(makeTimeLineDocument(), helpers.getWeeklySessionTimes);
  render(container, session);
  return container.children[0];
};
assert.strictEqual(
  renderWeeklyTimes(weeklyTimeHelpers, fourZoneSession).textContent,
  '11:00 AM ET · 10:00 AM CT · 9:00 AM MT · 8:00 AM PT',
  'each session must show the timezone beside its matching time, with no global legend dependency'
);
assert.strictEqual(
  renderWeeklyTimes(locationModeHelpers, fourZoneSession).textContent,
  '11:00 AM ET · New York · 10:00 AM CT · Chicago · 9:00 AM MT · Denver · 8:00 AM PT · Los Angeles',
  'city display mode must keep each city with its own time and abbreviation'
);
assert.deepStrictEqual(
  [
    [1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]
  ].map(([sessions, presenters]) => weeklyTimeHelpers.getWeeklyPresenterPhotoSize(sessions, presenters)),
  [88, 68, 76, 60, 64, 54],
  'presenter photo size must grow for fewer sessions and scale down as each session adds presenters'
);
const photoSizeFixtures = [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]];
const weeklyPhotoSizesAt = size => photoSizeFixtures.map(([sessions, presenters]) =>
  weeklyTimeHelpers.getWeeklyPresenterPhotoSize(sessions, presenters, size));
assert.deepStrictEqual(weeklyPhotoSizesAt(70), [66, 51, 57, 45, 48, 40], 'the existing low profile-size setting must scale weekly avatars down');
assert.deepStrictEqual(weeklyPhotoSizesAt(94), [88, 68, 76, 60, 64, 54], 'the existing default profile-size setting must preserve weekly avatar sizes');
assert.deepStrictEqual(weeklyPhotoSizesAt(124), [116, 90, 100, 79, 84, 71], 'the existing high profile-size setting must scale weekly avatars up');
assert.deepStrictEqual(
  weeklyTimeHelpers.getWeeklySessionCaptionLines(fourZoneSession),
  [
    '• Example session — Monday, November 16, 2026',
    '  11:00 AM ET',
    '  10:00 AM CT',
    '  9:00 AM MT',
    '  8:00 AM PT',
    '  Register: https://somebodytotalkto.com/s/abc123def0',
    ''
  ],
  'caption output must include the date, all zone times, and the QR-linked alias',
);
const captionStart = source.indexOf('function getWeeklySessionCaptionLines');
const captionEnd = source.indexOf('\nfunction getWeeklyPostPageKey', captionStart);
const getAggregateCaptionLines = new Function(
  'calendarNormalizeSpaces',
  'calendarFormatWeeklySessionDate',
  'getWeeklySessionTimes',
  'isWeeklyCalendarAggregateMode',
  `${source.slice(captionStart, captionEnd)} return getWeeklySessionCaptionLines;`
)(normalizeSpaces, session => session.date, () => [], () => true);
assert.deepStrictEqual(
  getAggregateCaptionLines({ title: 'Cross-partner session', partner: 'Partner Two', date: 'Monday, November 16, 2026' }),
  ['• Cross-partner session — Monday, November 16, 2026', '  Partner: Partner Two', '  Time TBA', '  Register: ', ''],
  'aggregate weekly post captions must identify each session partner',
);
assert.strictEqual(weeklyTimeHelpers.getWeeklySessionCardColor({ card_color: '#173F5F' }), '#173F5F');
assert.deepStrictEqual(
  [0, 1, 2, 3].map(index => weeklyTimeHelpers.getWeeklySessionCardColor({}, index)),
  ['#93c47d', '#bf9000', '#76a5af', '#93c47d'],
  'missing per-session card colors must cycle the canonical green, gold, and teal palette by session order',
);
assert.strictEqual(
  weeklyTimeHelpers.getWeeklySessionCardColor({ card_color: '#173F5F' }, 1),
  '#173F5F',
  'an explicit per-session card color must override the canonical fallback palette',
);
assert.strictEqual(
  weeklyTimeHelpers.getWeeklySessionCardColor({ card_color: 'not-a-color' }, 1),
  '#bf9000',
  'an invalid explicit card color must fall back to that session position in the canonical palette',
);

const draftStart = source.indexOf('function getWeeklyPostPageKey');
const draftEnd = source.indexOf('function updateWeeklyPostPanel', draftStart);
assert(draftStart >= 0 && draftEnd > draftStart, 'weekly post draft helpers must be present');
const weeklyDraftHelpers = new Function(
  'initialState',
  `let activePartnerKey = initialState.activePartnerKey;
   let selectedWeeklyYear = initialState.selectedWeeklyYear;
   let selectedWeeklyWeek = initialState.selectedWeeklyWeek;
   let selectedWeeklyDays = new Set(initialState.selectedWeeklyDays);
   let selectedWeeklyPage = initialState.selectedWeeklyPage;
   let weeklyPostTextArea = { value: '' };
   const weeklyPostDraftCache = new Map();
   let weeklyPostDraftPageKey = '';
   let weeklyPostDraftDirty = false;
   ${source.slice(draftStart, draftEnd)}
   return {
     getWeeklyPostPageKey,
     setWeeklyPostDraft,
     saveWeeklyPostDraftEdit,
     weeklyPostTextArea,
     setPage(page) { selectedWeeklyPage = page; }
   };`
)({
  activePartnerKey: 'city-of-hope',
  selectedWeeklyYear: 2026,
  selectedWeeklyWeek: 47,
  selectedWeeklyDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  selectedWeeklyPage: 0,
});
const firstPageKey = weeklyDraftHelpers.getWeeklyPostPageKey();
weeklyDraftHelpers.setWeeklyPostDraft(firstPageKey, 'Generated page one');
weeklyDraftHelpers.weeklyPostTextArea.value = 'Edited page one';
weeklyDraftHelpers.saveWeeklyPostDraftEdit();
weeklyDraftHelpers.setPage(1);
const secondPageKey = weeklyDraftHelpers.getWeeklyPostPageKey();
weeklyDraftHelpers.setWeeklyPostDraft(secondPageKey, 'Generated page two');
weeklyDraftHelpers.weeklyPostTextArea.value = 'Edited page two';
weeklyDraftHelpers.saveWeeklyPostDraftEdit();
weeklyDraftHelpers.setPage(0);
weeklyDraftHelpers.setWeeklyPostDraft(firstPageKey, 'Updated generated page one');
assert.strictEqual(weeklyDraftHelpers.weeklyPostTextArea.value, 'Edited page one', 'manual draft edits must survive page changes and refreshes');
weeklyDraftHelpers.setPage(1);
weeklyDraftHelpers.setWeeklyPostDraft(secondPageKey, 'Updated generated page two');
assert.strictEqual(weeklyDraftHelpers.weeklyPostTextArea.value, 'Edited page two', 'each page must restore its own manual draft');

const aliasStart = source.indexOf('function getWeeklySessionAliasApiUrl');
const aliasEnd = source.indexOf('async function getWeeklySessionWithAlias', aliasStart);
assert(aliasStart >= 0 && aliasEnd > aliasStart, 'weekly first-party alias request builder must be present');
const buildAliasUrl = new Function(
  'getCalendarConfig',
  'getAllCalendarSessionsApiUrl',
  'getSessionApiUrl',
  `${source.slice(aliasStart, aliasEnd)} return getWeeklySessionAliasApiUrl;`,
)(
  () => ({ sessionsApiUrl: 'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=13455&status=active' }),
  url => url.replace(/([?&]status=)[^&]*/i, '$1all'),
  (url, params) => {
    const parsed = new URL(url);
    Object.entries(params).forEach(([key, value]) => parsed.searchParams.set(key, value));
    return parsed.href;
  },
);
const aliasRequest = new URL(buildAliasUrl({ uuid: 'session-uuid' }));
assert.strictEqual(aliasRequest.searchParams.get('partner'), '13455');
assert.strictEqual(aliasRequest.searchParams.get('status'), 'all');
assert.strictEqual(aliasRequest.searchParams.get('uuid'), 'session-uuid');
assert.strictEqual(aliasRequest.searchParams.get('card_type'), 'facebook-promo');
assert.strictEqual(aliasRequest.searchParams.get('base64'), 'yes', 'session detail must include export-safe speaker photos and the matching QR image');
assert.strictEqual(aliasRequest.searchParams.get('view'), 'full');

const registrationAssetsStart = source.indexOf('function getWeeklySessionRegistrationAssets');
const registrationAssetsEnd = source.indexOf('async function getWeeklySessionWithAlias', registrationAssetsStart);
assert(registrationAssetsStart >= 0 && registrationAssetsEnd > registrationAssetsStart, 'weekly registration asset source must be present');
const resolveWeeklyRegistrationAssets = new Function(
  'getApprovedRegistrationShortUrl',
  'isCanonicalTrackedRegistrationUrl',
  `${source.slice(registrationAssetsStart, registrationAssetsEnd)}
   return getWeeklySessionRegistrationAssets;`
)(
  value => ['https://somebodytotalkto.com/s/abc123def0', 'https://somebodytotalkto.com/s/thu123abc456'].includes(value) ? value : '',
  value => value === 'https://somebodytotalkto.com/r/' + 'a'.repeat(43),
);
assert.deepStrictEqual(
  resolveWeeklyRegistrationAssets({
    qr_payload_url: 'https://somebodytotalkto.com/s/abc123def0',
    tracked_registration_url: 'https://somebodytotalkto.com/r/' + 'a'.repeat(43),
    qr_base64: 'data:image/png;base64,ZmFrZQ=='
  }),
  { shortUrl: 'https://somebodytotalkto.com/s/abc123def0', qrSrc: 'data:image/png;base64,ZmFrZQ==' },
  'the displayed alias and QR image must come from the same first-party API response',
);
assert.deepStrictEqual(
  resolveWeeklyRegistrationAssets(week47UnassignedThursday),
  { shortUrl: 'https://somebodytotalkto.com/s/thu123abc456', qrSrc: week47UnassignedThursday.qr_base64 },
  'the unassigned Thursday must keep its own short URL and matching QR payload',
);
assert(source.includes('const dataUrl = weeklyQrDataUrlCache.get(payloadUrl) || \'\';'));
assert(source.includes('image.src = dataUrl;'), 'each footer QR must use the verified image from its own registration alias');
assert(source.includes('qr.dataset.weeklyPayloadUrl = session.weekly_short_url;'), 'each QR payload must use that session’s short URL');
assert(source.includes('shortUrl.href = session.weekly_short_url;'), 'each poster row must keep its short URL clickable beside the QR');
assert(!source.includes("className = 'weekly-calendar-register-cta'"), 'weekly poster rows must not render the red Register CTA');
assert(source.includes('shortUrl.textContent = session.weekly_short_url;'));
assert(source.includes('link.textContent = shortUrl;'));
assert(source.includes('postLines.push(...getWeeklySessionCaptionLines(session));'));
assert(source.includes("className = 'weekly-calendar-session-partner'"), 'each session card must visibly label its partner');
assert(source.includes('partnerName || !session._weeklyFromUnassignedApi'), 'unassigned aggregate rows must not show a missing-partner placeholder');
assert(source.includes("className = 'weekly-post-session-partner'"), 'aggregate post rows must visibly label each session partner');
assert(source.includes('list.dataset.sessionCount = String(rows.length);'), 'the visible card count must select a matching one- through four-session layout');
assert(source.includes('background: #fff;'));
assert(source.includes('background: #159B36;'), 'session dates must appear in green date panels');
assert(source.includes('background: linear-gradient(112deg, #680078 0%, var(--weekly-banner-color, #85008C) 54%, #A51BA6 100%);'));
assert(source.includes('background: #EAF7FB;'), 'weekly posters must use the specified light-blue background');
assert(source.includes('fill="#A4D95B"') && source.includes('fill="#A51BA6"'), 'the purple header must transition through the green and lavender wave');
assert(source.includes('weekly-card-no-logo-bar .calendar-spotlight-band {\n  min-height: 113px;'), 'a poster without visible logos must keep the header within the target height range');
assert(source.includes("classList.toggle('weekly-card-no-logo-bar', noVisibleLogos)"));
assert(source.includes('line.textContent = times.map(({ label, time }) => `${time} ${label}`).join(\' · \');'));
assert(source.includes("className = 'weekly-calendar-speaker-registration'"));
assert(source.includes("registrationItem.className = registrationPlacement === 'inline'"));
assert(source.includes("'weekly-calendar-registration-item weekly-calendar-inline-registration'"));
assert(source.includes('registration.dataset.sessionCount = String(rows.length);'));
assert(source.includes('registration.hidden = true;'), 'weekly cards must hide the shared registration footer for every session count');
assert(source.includes("if (registrationPlacement === 'inline') heading.appendChild(registrationItem);"), 'every session registration must sit beneath its own title and time');
assert(!source.includes('registrationItems.appendChild(registrationItem)'), 'weekly session QR items must never be duplicated in the shared footer');
assert(source.includes('weekly-calendar-inline-registration .weekly-calendar-qr-block {')
  && source.includes('shortUrl.href = session.weekly_short_url;'), 'the inline QR must retain a clickable per-session short URL');
assert(source.includes('const category = getWeeklyCalendarCategoryForWeekday(')
  && source.includes('calendarParseApiDate(session.date).weekday'), 'weekly category labels must follow the session date weekday');
assert(source.includes('const indications = category ? [category] : [];'), 'weekly cards must render only the selected weekday category');
const weeklyCategoryStart = source.indexOf('function getWeeklyCalendarCategoryForWeekday');
const weeklyCategoryEnd = source.indexOf('\nfunction calendarGetIsoWeekFromDate', weeklyCategoryStart);
assert(weeklyCategoryStart >= 0 && weeklyCategoryEnd > weeklyCategoryStart, 'weekday category mapping helper must be present');
const getWeeklyCalendarCategoryForWeekday = new Function(
  `${source.slice(weeklyCategoryStart, weeklyCategoryEnd)} return getWeeklyCalendarCategoryForWeekday;`
)();
assert.deepStrictEqual(
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday'].map(day => getWeeklyCalendarCategoryForWeekday(day, ['Amyloidosis', 'Neurology'])),
  ['Patient Best Practices', 'Disease Specific', 'Disease Specific', 'Psycho-Social'],
);
assert.deepStrictEqual(
  ['Mon', 'Tue', 'Wed', 'Thu'].map(day => getWeeklyCalendarCategoryForWeekday(day, ['Amyloidosis', 'Neurology'])),
  ['Patient Best Practices', 'Disease Specific', 'Disease Specific', 'Psycho-Social'],
);
assert.strictEqual(
  getWeeklyCalendarCategoryForWeekday('Thu', week47UnassignedThursday.indications),
  'Psycho-Social',
  'the actual Thursday session fixture must render its approved weekly category'
);
assert.strictEqual(getWeeklyCalendarCategoryForWeekday('Friday', ['Amyloidosis', 'Neurology']), '', 'Friday must not receive an invented weekday category');
assert.strictEqual(getWeeklyCalendarCategoryForWeekday('Saturday', ['Psycho-Social', 'Disease Specific']), 'Psycho-Social', 'weekend cards may show an explicitly approved category, capped at one tag');
assert.strictEqual(getWeeklyCalendarCategoryForWeekday('Sunday', ['Disease Specific']), 'Disease Specific');
const registrationPlacementStart = source.indexOf('function getWeeklyCalendarRegistrationPlacement');
const registrationPlacementEnd = source.indexOf('\nasync function renderWeeklyCalendarSessions', registrationPlacementStart);
assert(registrationPlacementStart >= 0 && registrationPlacementEnd > registrationPlacementStart, 'weekly registration placement helper must be present');
const getWeeklyCalendarRegistrationPlacement = new Function(
  `${source.slice(registrationPlacementStart, registrationPlacementEnd)} return getWeeklyCalendarRegistrationPlacement;`
)();
assert.deepStrictEqual([0, 1, 2, 3].map(getWeeklyCalendarRegistrationPlacement), ['none', 'inline', 'inline', 'inline']);
assert(source.includes('qr.width = 52;'));
assert(source.includes('qr.height = 52;'));
assert(source.includes('session?.card_color'));
assert(source.includes('background: #F3FBEA;'));
assert(source.includes('border: 1px solid #159B36;'));
assert(source.includes('color: #075B36;'));
assert(!source.includes('background: #C62828;'), 'weekly poster registration must not render the red CTA');
assert(source.includes('flex: 0 0 var(--weekly-presenter-photo-size, 64px);'));
assert(source.includes('flex: 0 0 52px;'));
assert(source.includes('width: 52px;'));
assert(52 * (1440 / (4.8 * 96)) >= 160 && 52 * (1440 / (4.8 * 96)) < 180,
  'the inline QR must render around 160px wide in the 1440px export');
const inlineRegistrationCssStart = source.indexOf('.weekly-calendar-inline-registration {');
const inlineRegistrationCssEnd = source.indexOf('\n.weekly-calendar-inline-registration .weekly-calendar-qr-block', inlineRegistrationCssStart);
const inlineRegistrationCss = source.slice(inlineRegistrationCssStart, inlineRegistrationCssEnd);
assert(/background:\s*transparent;/.test(inlineRegistrationCss));
assert(/border:\s*0;/.test(inlineRegistrationCss));
assert(/padding:\s*0;/.test(inlineRegistrationCss));
assert(!inlineRegistrationCss.includes('#F8FFF2') && !inlineRegistrationCss.includes('#BBDDB3'),
  'the QR must not sit inside a colored panel or border');
assert(source.includes('.calendar-sessions[data-session-count="1"] .weekly-calendar-session-row'));
assert(source.includes('.calendar-sessions[data-session-count="2"] .weekly-calendar-session-row'));
assert(source.includes('.calendar-sessions[data-session-count="3"] .weekly-calendar-session-row'));
assert(source.includes("condition.setAttribute('role', 'list');"));
assert(source.includes('category.textContent = indication;'), 'session indications must render as separate readable category chips');

assert(source.includes('id="weekly-calendar-indication"') && source.includes('value="Amyloidosis" selected'),
  'the weekly indication control must default to Amyloidosis');
assert(source.includes('id="weekly-calendar-indication" aria-label="Filter weekly sessions by indication"'));
assert(source.includes("weeklyCalendarIndicationSelect?.addEventListener('change'"), 'changing the weekly indication must rerender the card');
assert(source.includes('const WEEKLY_CALENDAR_PAGE_SIZE = 4;'), 'weekly posters must place up to four sessions on one card');
assert(source.includes('.calendar-sessions[data-session-count="4"] .weekly-calendar-session-row'));
assert(source.includes('.calendar-sessions[data-session-count="4"] .weekly-calendar-session-title'));
assert(source.includes('const isHeaderLogoSlotVisible = slot => headerLogoControlsVisible\n    && (!headerLogoCountVisible || slot <= selectedHeaderLogoCount);'),
  'aggregate weekly mode must offer all three slots from the shared header logo selector');
assert(!source.includes('weekly-calendar-timezone-legend'), 'the banner must not contain a global timezone legend');
assert(source.includes('presenter.institution_name') || source.includes('getPresenterEmployer(presenter)'), 'speaker affiliations must retain institution details when supplied');
assert(source.includes('option value="abbreviation">Abbreviation only'));
assert(source.includes('option value="location">Abbreviation + city'));
assert(!source.includes('weekly-calendar-session-timezone'), 'timezone labels must sit beside each displayed time');
assert(source.includes('weeklyTimezoneDisplayMode'), 'the abbreviation/city selector must drive the per-session labels');
assert(source.includes("className = 'weekly-calendar-session-title'"));
assert(source.includes("className = 'weekly-calendar-condition'"));
assert(source.includes("className = 'weekly-calendar-speaker'"));
assert(!source.includes('weekly-calendar-register-cta'));
const weeklyPresenterHelperStart = source.indexOf('function getPresenterEmployer');
const weeklyPresenterHelperEnd = source.indexOf('function getPresenterDisplay', weeklyPresenterHelperStart);
assert(weeklyPresenterHelperStart >= 0 && weeklyPresenterHelperEnd > weeklyPresenterHelperStart, 'weekly presenter display helpers must be present');
const weeklyPresenterHelpers = new Function(
  'calendarNormalizeSpaces',
  'calendarNormalizeSuffix',
  `${source.slice(weeklyPresenterHelperStart, weeklyPresenterHelperEnd)}
   return { getPresenterEmployer, getWeeklyPresenterDisplayName, getWeeklyPresenterCredentials };`
)(
  value => String(value || '').replace(/\s{2,}/g, ' ').trim(),
  value => String(value || '').replace(/\s{2,}/g, ' ').trim().replace(/\./g, '').split(',').map(part => part.trim()).filter(Boolean).join(', ')
);
const presenterFixture = {
  first_name: 'Alexandra',
  last_name: 'Whitcomb',
  display_name: 'Ignored Display Name',
  name_suffix: 'MD, Ph.D.',
  credentials: ['FACC', 'MD'],
  credential: 'FACC, DO',
  professional_credentials: 'PhD',
  title: 'MD, FACC',
  job_title: 'Center Director',
  role: 'Chief',
  specialty: 'Amyloidosis',
  specialty_line_1: 'Advanced Imaging',
  specialty_line_2: 'Cardiology',
  biography: 'Must not appear on the poster',
  employer: 'Mayo Clinic'
};
assert.strictEqual(weeklyPresenterHelpers.getWeeklyPresenterDisplayName(presenterFixture), 'Alexandra Whitcomb');
assert.strictEqual(
  weeklyPresenterHelpers.getWeeklyPresenterCredentials(presenterFixture),
  'MD, PhD, FACC, DO',
  'weekly presenter text must include only de-duplicated suffix and credential fields'
);
assert.strictEqual(
  weeklyPresenterHelpers.getWeeklyPresenterCredentials({ title: 'MD, FACC' }),
  'MD, FACC',
  'credential abbreviations from the API title field must remain available'
);
assert.strictEqual(
  weeklyPresenterHelpers.getWeeklyPresenterCredentials({ title: 'Professor of Cardiology' }),
  '',
  'job titles and specialty prose must not appear as presenter credentials'
);
assert.strictEqual(weeklyPresenterHelpers.getPresenterEmployer(presenterFixture), 'Mayo Clinic');
const weeklyPresenterMarkupStart = source.indexOf('presenters.forEach(presenter => {', source.indexOf('async function renderWeeklyCalendarSessions'));
const weeklyPresenterMarkupEnd = source.indexOf('const speakerRegistration =', weeklyPresenterMarkupStart);
const weeklyPresenterMarkup = source.slice(weeklyPresenterMarkupStart, weeklyPresenterMarkupEnd);
assert(weeklyPresenterMarkup.includes('getWeeklyPresenterDisplayName(presenter)'));
assert(weeklyPresenterMarkup.includes('getWeeklyPresenterCredentials(presenter)'));
assert(!/presenter\.(?:title|job_title|role|specialty|specialty_line_\d|biography|bio|description)\b/.test(weeklyPresenterMarkup), 'weekly presenter markup must not read role, specialty, biography, or other descriptive fields');
assert(source.includes('flex-basis: var(--weekly-presenter-photo-size, 88px);')
  && source.includes('flex-basis: var(--weekly-presenter-photo-size, 76px);')
  && source.includes('flex-basis: var(--weekly-presenter-photo-size, 64px);'), 'weekly presenter photos must grow in every session-count layout');
assert.strictEqual((source.match(/id="headshot-image-size"/g) || []).length, 1, 'weekly sizing must reuse the existing profile image control');
assert(source.includes("const imageSizeControlVisible = weeklyCalendarCard\n    ? ready && currentSide === 'front'"), 'the existing profile image control must appear on the weekly front only');
assert(source.includes('fontSizeGroup.before(profileImageControl);')
  && source.includes('fontSizeGroup.insertBefore(profileImageControl, firstMultiPresenterControl || null);'), 'the profile image control must sit outside the shared font-size fieldset only in weekly mode');
assert(source.includes("el.style.display = sessionAdjustmentControlsVisible ? '' : 'none';"), 'weekly mode must not reveal an otherwise empty shared font-size fieldset');
assert(source.includes('getWeeklyPresenterPhotoSize(rows.length, presenters.length, selectedHeadshotSize)'), 'new weekly session rows must use the selected profile size');
assert(source.includes('function applyWeeklyCalendarPresenterSizes()')
  && source.includes('applyWeeklyCalendarPresenterSizes();\n    syncWeeklyCalendarCanvasSize();'), 'profile size changes must reflow weekly presenters and recalculate the one/two-session canvas');
assert(source.includes('weekly-presenter-size-stack') && source.includes('weekly-presenter-photo-stacked'), 'large weekly presenter photos must reflow before overlapping labels');
assert(source.includes('.weekly-calendar-speakers.weekly-has-multiple-speakers.weekly-grid-presenters.weekly-presenter-size-stack,')
  && source.includes('grid-template-columns: minmax(0, 1fr);'), 'large one/two-session portraits must override the two-column presenter grid when it would squeeze names');
assert(source.includes('.calendar-sessions[data-session-count="1"] .weekly-calendar-speakers .weekly-calendar-speaker {\n  align-items: center;\n  flex-direction: column;')
  && source.includes('.calendar-sessions[data-session-count="1"] .weekly-calendar-speakers .weekly-calendar-speaker-copy {\n  align-self: stretch;'), 'single-session presenter blocks must place larger portraits above full-width readable text');
assert(source.includes('overflow-wrap: break-word;\n  word-break: normal;'), 'single-session presenter labels must wrap at word boundaries instead of forming vertical letter columns');
assert(source.includes('if (presenterCount > 1) {\n          photoSize = Math.min(photoSize, Math.max(24, Math.floor(cellWidth - 4)));'), 'single-session portraits must fit their profile columns without squeezing the text');
assert(source.includes('.calendar-sessions[data-session-count="2"] .weekly-calendar-speakers.weekly-has-multiple-speakers {\n  grid-template-columns: minmax(0, 1fr);'), 'two-session posters must stack multiple speaker blocks so larger portraits leave readable text width');
assert(source.includes('font-size: calc(22px * var(--calendar-date-chip-scale, 1));'), 'the day/date size control must scale weekly date text');
assert(source.includes('id="weekly-session-title-size" type="range" min="70" max="130" step="5" value="100"'), 'the weekly-only title size control must offer a bounded percentage range');
assert(source.includes('label class="field-control weekly-filter-control" for="weekly-session-title-size"'), 'the session title size control must be hidden outside weekly mode');
assert(source.includes('font-size: calc(9px * var(--weekly-session-title-scale, 1));')
  && source.includes('font-size: calc(13px * var(--weekly-session-title-scale, 1)); line-height: 1.16;')
  && source.includes('font-size: calc(8px * var(--weekly-session-title-scale, 1)); line-height: 1.1;'), 'the weekly title scale must apply across 1, 2, and 3 session layouts');
assert(source.includes('justify-content: flex-start;\n  min-width: 0;\n  padding: 6px 8px;'), 'weekly session heading blocks must align from the top');
assert(source.includes("selectedWeeklySessionTitleSize = loadFontSize(WEEKLY_SESSION_TITLE_SIZE_STORAGE_KEY, DEFAULT_WEEKLY_SESSION_TITLE_SIZE, layout);"), 'weekly title size must survive switching layouts through card-scoped storage');
const titleScaleStart = source.indexOf('function applyWeeklySessionTitleSize()');
const titleScaleEnd = source.indexOf('\nfunction refreshWeeklySessionTitleSizeControl', titleScaleStart);
assert(titleScaleStart >= 0 && titleScaleEnd > titleScaleStart, 'weekly title scale updater must be present');
const makeTitleScaleUpdater = (initialSize, weeklyLayout) => {
  const rootStyles = new Map();
  let syncCalls = 0;
  let labelCalls = 0;
  const apply = new Function(
    'initialSize',
    'rootStyles',
    'isWeeklyCalendarCardLayout',
    'syncWeeklyCalendarCanvasSize',
    'updateSizeLabel',
    `let selectedWeeklySessionTitleSize = initialSize;
     const document = { documentElement: { style: { setProperty: (key, value) => rootStyles.set(key, value) } } };
     ${source.slice(titleScaleStart, titleScaleEnd)}
     return { applyWeeklySessionTitleSize, setSize: value => { selectedWeeklySessionTitleSize = value; } };`
  )(initialSize, rootStyles, () => weeklyLayout, () => { syncCalls++; }, () => { labelCalls++; });
  return { apply, rootStyles, getSyncCalls: () => syncCalls, getLabelCalls: () => labelCalls };
};
const scaledWeeklyTitle = makeTitleScaleUpdater('130', true);
scaledWeeklyTitle.apply.applyWeeklySessionTitleSize();
assert.strictEqual(scaledWeeklyTitle.rootStyles.get('--weekly-session-title-scale'), '1.3');
assert.strictEqual(scaledWeeklyTitle.getSyncCalls(), 1, 'weekly title changes must recalculate the measured canvas for every session count');
assert.strictEqual(scaledWeeklyTitle.getLabelCalls(), 1, 'weekly title changes must refresh the displayed export dimensions');
scaledWeeklyTitle.apply.setSize('-1');
scaledWeeklyTitle.apply.applyWeeklySessionTitleSize();
assert.strictEqual(scaledWeeklyTitle.rootStyles.get('--weekly-session-title-scale'), '0.7', 'stored title scales must clamp to the supported minimum');
const scaledMonthlyTitle = makeTitleScaleUpdater('100', false);
scaledMonthlyTitle.apply.applyWeeklySessionTitleSize();
assert.strictEqual(scaledMonthlyTitle.getSyncCalls(), 0, 'monthly cards must not run weekly canvas sizing');
assert.strictEqual(scaledMonthlyTitle.getLabelCalls(), 0, 'monthly cards must not refresh the weekly canvas label');
assert(source.includes('calc(82px * var(--calendar-date-chip-scale, 1))')
  && source.includes('calc(68px * var(--calendar-date-chip-scale, 1))')
  && source.includes('calc(60px * var(--calendar-date-chip-scale, 1))'), 'the day/date size control must scale all weekly date-panel widths');
assert(source.includes('const sessionAdjustmentControlsVisible = sessionFontControlsVisible && !weeklyCalendarCard;'), 'generic session font controls must be hidden when their styles do not apply to weekly posters');
assert(source.includes("el.style.display = ready && !weeklyCalendarCard\n      && (sessionLookupVisible || anyCalendarCard || isMultiPresenterFacebookPromo()) ? '' : 'none';"), 'the single-timezone selector must be hidden on weekly cards, which always display all four zones');
assert(!source.includes('&& !(weeklyCalendarCard && isWeeklyCalendarAggregateMode() && slot === 1);'), 'aggregate weekly cards must keep the first selectable header logo slot available');
const canvasDimensionStart = source.indexOf('function getWeeklyCalendarCanvasDimensions');
const canvasDimensionEnd = source.indexOf('\nfunction syncWeeklyCalendarCanvasSize', canvasDimensionStart);
assert(canvasDimensionStart >= 0 && canvasDimensionEnd > canvasDimensionStart, 'weekly export sizing helper must be present');
const getWeeklyCalendarCanvasDimensions = new Function(
  `${source.slice(canvasDimensionStart, canvasDimensionEnd)} return getWeeklyCalendarCanvasDimensions;`
)();
const minimumCanvasHeight = Math.ceil(1440 / 1.91);
for (const count of [1, 2, 3, 4]) {
  const trimmed = getWeeklyCalendarCanvasDimensions(count, 400);
  assert.strictEqual(trimmed.pxW, 1440);
  assert.strictEqual(trimmed.pxH, 1250, `${count}-session canvas height must follow the measured content`);
  assert.strictEqual(trimmed.hIn, trimmed.pxH / 300, 'the export inches must match the 300 DPI pixel height');
  assert(trimmed.pxH >= minimumCanvasHeight && trimmed.pxH < 1800, 'shorter content must not be forced to the maximum canvas height');
  assert.strictEqual(getWeeklyCalendarCanvasDimensions(count, 100).pxH, minimumCanvasHeight, 'short content must stay within the supported feed image ratio');
  assert.strictEqual(getWeeklyCalendarCanvasDimensions(count, 700).pxH, 1800, 'long content must stop at the 4:5 canvas limit');
}
assert.strictEqual(getWeeklyCalendarCanvasDimensions(3, 420).pxH, 1313, 'three-session canvas height must follow rendered content instead of forcing the maximum');
assert.strictEqual(getWeeklyCalendarCanvasDimensions(4, 420).pxH, 1313, 'four-session canvas height must follow rendered content while respecting the 1800px cap');
assert.strictEqual(getWeeklyCalendarCanvasDimensions(0, 0).pxH, 1800, 'an unmeasured card must keep the safe full canvas size');
const contentHeightStart = source.indexOf('function getWeeklyCalendarContentHeight');
const contentHeightEnd = source.indexOf('\nfunction syncWeeklyCalendarCanvasSize', contentHeightStart);
assert(contentHeightStart >= 0 && contentHeightEnd > contentHeightStart, 'weekly content measurement helper must be present');
const getWeeklyCalendarContentHeight = new Function(
  `${source.slice(contentHeightStart, contentHeightEnd)} return getWeeklyCalendarContentHeight;`
)();
const contentFixtureNode = (top, bottom, hidden = false) => ({
  hidden,
  getClientRects: () => hidden ? [] : [{}],
  getBoundingClientRect: () => ({ top, bottom, height: bottom - top })
});
const measuredBanner = contentFixtureNode(110, 180);
const measuredLongTitleRow = contentFixtureNode(205, 425);
const measuredQrFooter = contentFixtureNode(460, 600);
const hiddenOldFooter = contentFixtureNode(610, 999, true);
const renderedFrontFixture = {
  scrollHeight: 400,
  getClientRects: () => [{}],
  getBoundingClientRect: () => ({ top: 100, bottom: 500, height: 400 }),
  querySelectorAll: () => [measuredBanner, measuredLongTitleRow, measuredQrFooter, hiddenOldFooter]
};
const renderedSurfaceFixture = {
  scrollHeight: 420,
  getBoundingClientRect: () => ({ top: 100, bottom: 500, height: 400 })
};
assert.strictEqual(
  getWeeklyCalendarContentHeight(renderedSurfaceFixture, renderedFrontFixture),
  500,
  'canvas measurement must include the furthest visible banner, session row, and QR footer content while excluding hidden content'
);
assert(source.includes('Number(front.scrollHeight) || 0') && source.includes('visualBottom - surfaceRect.top'), 'weekly canvas measurement must include overflow beyond the card and nested rendered content');
const syncCanvasStart = source.indexOf('function syncWeeklyCalendarCanvasSize');
const syncCanvasEnd = source.indexOf('\nfunction getExportDimensions', syncCanvasStart);
assert(syncCanvasStart >= 0 && syncCanvasEnd > syncCanvasStart, 'weekly canvas synchronization helper must be present');
const makeCanvasSynchronizer = (fixtureSurface, measureContent) => new Function(
  'surface',
  'isWeeklyCalendarCardLayout',
  'currentSide',
  'getWeeklyCalendarCanvasDimensions',
  'getWeeklyCalendarContentHeight',
  `${source.slice(syncCanvasStart, syncCanvasEnd)} return syncWeeklyCalendarCanvasSize;`
)(fixtureSurface, () => true, 'front', getWeeklyCalendarCanvasDimensions, measureContent);
const oversizedPresenterRows = Array.from({ length: 2 }, () => {
  const rowStyle = {
    photoSize: '79px',
    getPropertyValue: () => rowStyle.photoSize,
    setProperty: (_key, value) => { rowStyle.photoSize = value; }
  };
  return { style: rowStyle };
});
const oversizedFront = { querySelectorAll: () => oversizedPresenterRows };
const oversizedSurface = {
  dataset: { weeklySessionCount: '2' },
  style: { height: '', removeProperty: key => { if (key === 'height') oversizedSurface.style.height = ''; } },
  querySelector: () => oversizedFront
};
const measureOversizedContent = () => 592.8125 - oversizedPresenterRows.reduce(
  (removedHeight, row) => removedHeight + (79 - Number.parseFloat(row.style.photoSize)) * 2,
  0
);
const synchronizedOversizedCanvas = makeCanvasSynchronizer(oversizedSurface, measureOversizedContent)();
assert(synchronizedOversizedCanvas.pxH <= 1800, 'oversized weekly content must stay within the 4:5 canvas limit');
assert(measureOversizedContent() <= 1800 * 0.32, 'presenter photos must shrink only as needed to prevent clipping at the maximum canvas height');
assert.strictEqual(oversizedPresenterRows[0].style.photoSize, '73px', 'canvas fitting must preserve large portraits unless a bounded reduction is needed');
assert(Math.abs(Number.parseFloat(oversizedSurface.style.height) - synchronizedOversizedCanvas.pxH * 0.32) < 1e-9, 'synchronized surface height must match its measured PNG dimensions');
assert(source.includes("if (currentSide !== 'front')"), 'weekly back cards must keep their existing full-height canvas');
assert(source.includes("return { pxW: 1200, pxH: 1800, wIn: 4, hIn: 6, tag: '4x6', orientation: 'portrait' }"), 'monthly export dimensions must remain unchanged');

const dpiHelperStart = source.indexOf('function addPngDpiMetadata');
const dpiHelperEnd = source.indexOf('\nasync function captureCard', dpiHelperStart);
assert(dpiHelperStart >= 0 && dpiHelperEnd > dpiHelperStart, 'PNG DPI metadata helper must be present');
const addPngDpiMetadata = new Function(`${source.slice(dpiHelperStart, dpiHelperEnd)} return addPngDpiMetadata;`)();
const makePngChunk = (type, data = []) => {
  const bytes = Buffer.alloc(12 + data.length);
  bytes.writeUInt32BE(data.length, 0);
  bytes.write(type, 4, 'ascii');
  Buffer.from(data).copy(bytes, 8);
  return bytes;
};
const testPngHeader = Buffer.alloc(13);
testPngHeader.writeUInt32BE(1440, 0);
testPngHeader.writeUInt32BE(1800, 4);
testPngHeader[8] = 8;
testPngHeader[9] = 6;
const testPng = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  makePngChunk('IHDR', testPngHeader),
  makePngChunk('IDAT', [0]),
  makePngChunk('IEND')
]);
const dpiDataUrl = addPngDpiMetadata(`data:image/png;base64,${testPng.toString('base64')}`, 300);
const dpiPng = Buffer.from(dpiDataUrl.split(',')[1], 'base64');
let dpiChunk = null;
let dpiChunkOffset = 8;
while (dpiChunkOffset + 12 <= dpiPng.length) {
  const chunkLength = dpiPng.readUInt32BE(dpiChunkOffset);
  const chunkType = dpiPng.toString('ascii', dpiChunkOffset + 4, dpiChunkOffset + 8);
  if (chunkType === 'pHYs') dpiChunk = dpiPng.subarray(dpiChunkOffset + 8, dpiChunkOffset + 17);
  dpiChunkOffset += 12 + chunkLength;
}
assert(dpiChunk, 'weekly PNG exports must carry a pHYs resolution chunk');
assert.strictEqual(dpiChunk.readUInt32BE(0), 11811, 'weekly PNG horizontal resolution must equal 300 DPI');
assert.strictEqual(dpiChunk.readUInt32BE(4), 11811, 'weekly PNG vertical resolution must equal 300 DPI');
assert.strictEqual(dpiChunk[8], 1, 'PNG pHYs units must be pixels per meter');
assert.strictEqual(dpiPng.readUInt32BE(16), 1440, 'adding DPI metadata must preserve the configured PNG width');
assert.strictEqual(dpiPng.readUInt32BE(20), 1800, 'adding DPI metadata must preserve the configured PNG height');
const trimmedTestPng = Buffer.from(testPng);
trimmedTestPng.writeUInt32BE(1250, 20);
const trimmedDpiPng = Buffer.from(
  addPngDpiMetadata(`data:image/png;base64,${trimmedTestPng.toString('base64')}`, 300).split(',')[1],
  'base64'
);
assert.strictEqual(trimmedDpiPng.readUInt32BE(16), 1440, 'trimmed weekly exports must retain the full canvas width');
assert.strictEqual(trimmedDpiPng.readUInt32BE(20), 1250, 'trimmed weekly exports must retain the measured content height');

promoTermsChecks().then(() => {
  console.log('upcoming searchable week picker, profile-image and session-title sizing, poster layouts, registration QR integrity, speaker data, timezone, DPI metadata, and export checks passed');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
