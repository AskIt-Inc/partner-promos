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
     buildWeeklyCalendarSessionsApiUrl
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
  'https://somebodytotalkto.com/api/spotlight/microsite/sessions?partner=101,202&status=active',
  [202],
));
assert.strictEqual(selectedRequest.searchParams.get('partner'), '202', 'selected requests must replace any configured partner list with the selected ID only');
assert.strictEqual(selectedRequest.searchParams.get('status'), 'all');
assert.strictEqual(weeklyPartnerHelpers.buildWeeklyCalendarSessionsApiUrl(aggregateEndpoint, []), '', 'empty partner lists must never produce an unfiltered request');
assert.strictEqual(weeklyPartnerHelpers.getWeeklyPartnerAvailabilityMessage('loading', [], false), 'Loading the current promo-card-enabled partner list…');
assert.match(weeklyPartnerHelpers.getWeeklyPartnerAvailabilityMessage('error', [], false), /could not be loaded/);
assert.match(weeklyPartnerHelpers.getWeeklyPartnerAvailabilityMessage('ready', [], false), /No promo-card-enabled partners/);
assert.match(weeklyPartnerHelpers.getWeeklyPartnerAvailabilityMessage('ready', [], true), /selected partner is not currently promo-card enabled/);

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
  `${source.slice(dateStart, dateEnd)}
   return {
     calendarGetIsoWeekFromDate,
     calendarGetIsoWeekStartUtc,
     calendarGetIsoWeeksInYear,
     calendarFormatWeeklyRange,
     calendarFormatWeeklyWeekOption,
     getWeeklyCalendarWeekOptions,
     calendarGetWeeklyLabel,
     calendarGetWeeklySessions
   };`
)(monthIndex, dayNames, normalizeSpaces, 2026, 47, new Set(['Mon', 'Sun']));

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
  [false, true, true],
  'aggregate weekly cards must omit the partner slot while retaining explicitly selected shared logos'
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
assert(source.includes("weeklyCalendarStatus('No calendar sessions match the selected ISO week and days.')"), 'empty weekly filters must show the no-results state');

const weekPageStart = source.indexOf('function setWeeklyCalendarPeriod');
const weekPageEnd = source.indexOf('function initializeWeeklyCalendarControls', weekPageStart);
assert(weekPageStart >= 0 && weekPageEnd > weekPageStart, 'weekly period and pagination state handlers must be present');
let weeklyRenders = 0;
const weekPageHarness = new Function(
  'calendarGetIsoWeeksInYear',
  'calendarGetCurrentIsoWeek',
  'calendarGetWeeklySessions',
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
)(year => year === 2026 ? 53 : 52, () => ({ year: 2026, week: 46 }), sessions => sessions, 3, () => {}, () => {}, () => { weeklyRenders++; });
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
  `${source.slice(timezoneStart, timezoneEnd)}
   return {
     getWeeklyTimezoneLabel,
     getWeeklySessionTimes,
     getWeeklySessionCardColor,
     getWeeklyTimezonePresentation,
     getWeeklySessionCaptionLines
   };`
)({
  ...weeklyTimeZones
}, 'PT', 'abbreviation', normalizeSpaces,
value => String(value || '').trim().replace(/\s+(ET|CT|MT|PT)$/i, '').trim(),
session => session.date,
() => false,
{ CSS: { supports: (property, value) => property === 'color' && /^#[\da-f]{3,8}$/i.test(value) } });
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
assert.deepStrictEqual(
  weeklyTimeHelpers.getWeeklyTimezonePresentation([['ET', 'CT', 'MT', 'PT'], ['ET', 'CT', 'MT', 'PT']]),
  {
    placement: 'legend',
    legendLabels: ['ET', 'CT', 'MT', 'PT'],
    sessionLabels: [[], []]
  },
  'matching timezone sets must be listed once in the card legend',
);
assert.deepStrictEqual(
  weeklyTimeHelpers.getWeeklyTimezonePresentation([['ET', 'CT', 'MT', 'PT'], ['ET', 'PT']]),
  {
    placement: 'per-session',
    legendLabels: [],
    sessionLabels: [['ET', 'CT', 'MT', 'PT'], ['ET', 'PT']]
  },
  'different timezone sets must be labeled below each session title',
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
  `${source.slice(timezoneStart, timezoneEnd)} return { getWeeklySessionTimes, getWeeklyTimezonePresentation };`
)({ ...weeklyTimeZones }, 'ET', 'location', normalizeSpaces,
  value => String(value || '').trim().replace(/\s+(ET|CT|MT|PT)$/i, '').trim(),
  session => session.date,
  () => false,
  { CSS: { supports: () => true } });
assert.deepStrictEqual(
  locationModeHelpers.getWeeklyTimezonePresentation([['ET', 'CT', 'MT', 'PT'], ['ET', 'CT', 'MT', 'PT']]).legendLabels,
  ['ET · New York', 'CT · Chicago', 'MT · Denver', 'PT · Los Angeles'],
  'location display mode must label the complete shared timezone set',
);
assert.deepStrictEqual(
  locationModeHelpers.getWeeklyTimezonePresentation([['ET', 'CT', 'MT', 'PT'], ['ET', 'PT']]).sessionLabels,
  [
    ['ET · New York', 'CT · Chicago', 'MT · Denver', 'PT · Los Angeles'],
    ['ET · New York', 'PT · Los Angeles']
  ],
  'location display mode must retain per-session labels when timezone sets differ',
);
assert.deepStrictEqual(
  weeklyTimeHelpers.getWeeklySessionCaptionLines(fourZoneSession),
  [
    '• Example session — Monday, November 16, 2026',
    '  ET: 11:00 AM',
    '  CT: 10:00 AM',
    '  MT: 9:00 AM',
    '  PT: 8:00 AM',
    '  Register: https://somebodytotalkto.com/s/abc123def0',
    ''
  ],
  'caption output must include the date, all zone times, and the QR-linked alias',
);
const captionStart = source.indexOf('function getWeeklySessionCaptionLines');
const captionEnd = source.indexOf('function updateWeeklyTimezoneLegend', captionStart);
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
  value => value === 'https://somebodytotalkto.com/s/abc123def0' ? value : '',
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
assert(source.includes('const dataUrl = weeklyQrDataUrlCache.get(payloadUrl) || \'\';'));
assert(source.includes('image.src = dataUrl;'), 'each footer QR must use the verified image from its own registration alias');
assert(source.includes('qr.dataset.weeklyPayloadUrl = session.weekly_short_url;'), 'each QR payload must use that session’s short URL');
assert(source.includes('cta.href = session.weekly_short_url;'));
assert(source.includes('cta.textContent = `REGISTER · ${registrationDate}`;'));
assert(source.includes('shortUrl.textContent = session.weekly_short_url;'));
assert(source.includes('link.textContent = shortUrl;'));
assert(source.includes('postLines.push(...getWeeklySessionCaptionLines(session));'));
assert(source.includes("className = 'weekly-calendar-session-partner'"), 'each session card must visibly label its partner');
assert(source.includes("className = 'weekly-post-session-partner'"), 'aggregate post rows must visibly label each session partner');
assert(source.includes('list.dataset.sessionCount = String(rows.length);'), 'the visible card count must select the one-, two-, or three-session layout');
assert(source.includes('background: #fff;'));
assert(source.includes('background: #159B36;'), 'session dates must appear in green date panels');
assert(source.includes('background: linear-gradient(112deg, #680078 0%, var(--weekly-banner-color, #85008C) 54%, #A51BA6 100%);'));
assert(source.includes('background: #EAF7FB;'), 'weekly posters must use the specified light-blue background');
assert(source.includes('fill="#A4D95B"') && source.includes('fill="#A51BA6"'), 'the purple header must transition through the green and lavender wave');
assert(source.includes('weekly-card-no-logo-bar .calendar-spotlight-band {\n  min-height: 113px;'), 'a poster without visible logos must keep the header within the target height range');
assert(source.includes("classList.toggle('weekly-card-no-logo-bar', noVisibleLogos)"));
assert(source.includes('line.dataset.zone = zone;'));
assert(source.includes("className = 'weekly-calendar-speaker-registration'"));
assert(source.includes("className = 'weekly-calendar-registration-item'"));
assert(source.includes('registration.dataset.sessionCount = String(rows.length);'));
assert(source.includes('qr.width = 64;'));
assert(source.includes('qr.height = 64;'));
assert(source.includes('session?.card_color'));
assert(source.includes('background: #F3FBEA;'));
assert(source.includes('border: 1px solid #159B36;'));
assert(source.includes('color: #075B36;'));
assert(source.includes('background: #C62828;'));
assert(source.includes('flex: 0 0 34px;'));
assert(source.includes('flex: 0 0 64px;'), 'exported weekly QR images must remain at least 200 raster pixels wide');
assert(source.includes('width: 64px;'));
assert(64 * (1440 / (4.8 * 96)) >= 200, 'weekly QR cards must preserve a scan-sized raster code at export scale');
assert(source.includes('.calendar-sessions[data-session-count="1"] .weekly-calendar-session-row'));
assert(source.includes('.calendar-sessions[data-session-count="2"] .weekly-calendar-session-row'));
assert(source.includes('.calendar-sessions[data-session-count="3"] .weekly-calendar-session-row'));
assert(source.includes("condition.setAttribute('role', 'list');"));
assert(source.includes('category.textContent = indication;'), 'session indications must render as separate readable category chips');

assert(source.includes('const WEEKLY_CALENDAR_PAGE_SIZE = 3;'), 'weekly posters must paginate no more than three sessions per card');
assert(source.includes('ET · CT · MT · PT'), 'the header must name the four supported time zones');
assert(source.includes('presenter.institution_name') || source.includes('getPresenterEmployer(presenter)'), 'speaker affiliations must retain institution details when supplied');
assert(source.includes('option value="abbreviation">Abbreviation only'));
assert(source.includes('option value="location">Abbreviation + city'));
assert(source.includes("className = 'weekly-calendar-session-timezone'"));
assert(source.includes('Times: ${sessionLabels.join(\' · \')}'));
assert(source.includes("legend.textContent = 'ET · CT · MT · PT';"));
assert(source.includes("className = 'weekly-calendar-session-title'"));
assert(source.includes("className = 'weekly-calendar-condition'"));
assert(source.includes("className = 'weekly-calendar-speaker'"));
assert(source.includes("className = 'weekly-calendar-register-cta'"));
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
assert(source.includes('flex-basis: 60px;') && source.includes('flex-basis: 42px;') && source.includes('flex-basis: 36px;'), 'weekly presenter photos must grow in every session-count layout');
assert(source.includes('.calendar-sessions[data-session-count="1"] .weekly-calendar-speakers.weekly-has-multiple-speakers {\n  grid-template-columns: minmax(0, 1fr);'), 'single-session posters must stack multiple speaker blocks so larger portraits leave readable text width');
assert(source.includes('.calendar-sessions[data-session-count="2"] .weekly-calendar-speakers.weekly-has-multiple-speakers {\n  grid-template-columns: minmax(0, 1fr);'), 'two-session posters must stack multiple speaker blocks so larger portraits leave readable text width');
assert(source.includes('font-size: calc(22px * var(--calendar-date-chip-scale, 1));'), 'the day/date size control must scale weekly date text');
assert(source.includes('calc(82px * var(--calendar-date-chip-scale, 1))')
  && source.includes('calc(68px * var(--calendar-date-chip-scale, 1))')
  && source.includes('calc(60px * var(--calendar-date-chip-scale, 1))'), 'the day/date size control must scale all weekly date-panel widths');
assert(source.includes('const sessionAdjustmentControlsVisible = sessionFontControlsVisible && !weeklyCalendarCard;'), 'generic session font controls must be hidden when their styles do not apply to weekly posters');
assert(source.includes("el.style.display = ready && !weeklyCalendarCard\n      && (sessionLookupVisible || anyCalendarCard || isMultiPresenterFacebookPromo()) ? '' : 'none';"), 'the single-timezone selector must be hidden on weekly cards, which always display all four zones');
assert(source.includes('&& !(weeklyCalendarCard && isWeeklyCalendarAggregateMode() && slot === 1);'), 'the partner logo selector and its size/position controls must be hidden when aggregate mode intentionally omits slot 1');
assert(source.includes("return { pxW: 1440, pxH: 1800, wIn: 4.8, hIn: 6, tag: '4.8x6', orientation: 'portrait' }"));
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

promoTermsChecks().then(() => {
  console.log('upcoming searchable week picker, poster layouts, registration QR integrity, speaker data, timezone, DPI metadata, and export checks passed');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
