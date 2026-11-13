const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('index.html', 'utf8');
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
assert.strictEqual(weeklyHelpers.calendarGetWeeklyLabel(2026, 47), 'Week 47 · Nov 16–22, 2026');

const matchingSessions = weeklyHelpers.calendarGetWeeklySessions([
  { uuid: 'sun', date: 'Nov 22, 2026', timestamp: 6 },
  { uuid: 'outside', date: 'Nov 23, 2026', timestamp: 7 },
  { uuid: 'wed', date: 'Nov 18, 2026', timestamp: 2 },
  { uuid: 'mon', date: 'Nov 16, 2026', timestamp: 0 },
]);
assert.deepStrictEqual(matchingSessions.map(session => session.uuid), ['mon', 'sun']);

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
{ CSS: { supports: (property, value) => property === 'color' && /^#[\da-f]{3,8}$/i.test(value) } });
assert.strictEqual(weeklyTimeHelpers.getWeeklyTimezoneLabel('PT'), 'PT');
assert.strictEqual(weeklyTimeHelpers.getWeeklyTimezoneLabel('PT', 'location'), 'PT · Los Angeles');
const fourZoneSession = {
  uuid: 'four-zones',
  title: 'Example session',
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
  'window',
  `${source.slice(timezoneStart, timezoneEnd)} return { getWeeklySessionTimes, getWeeklyTimezonePresentation };`
)({ ...weeklyTimeZones }, 'ET', 'location', normalizeSpaces,
  value => String(value || '').trim().replace(/\s+(ET|CT|MT|PT)$/i, '').trim(),
  session => session.date,
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
assert(source.includes('qr.src = session.weekly_qr_src;'));
assert(source.includes('cta.href = session.weekly_short_url;'));
assert(source.includes('cta.textContent = `REGISTER · ${registrationDate}`;'));
assert(source.includes('shortUrl.textContent = session.weekly_short_url;'));
assert(source.includes('link.textContent = shortUrl;'));
assert(source.includes('postLines.push(...getWeeklySessionCaptionLines(session));'));
assert(source.includes("row.style.setProperty('--weekly-session-card-color', cardColor)"));
assert(source.includes('selectedWeeklyPage * WEEKLY_CALENDAR_PAGE_SIZE + index'));
assert(source.includes('background: var(--weekly-session-card-color, #93c47d);'));
assert(source.includes('line.dataset.zone = zone;'));
assert(source.includes("className = 'weekly-calendar-speaker-registration'"));
assert(source.includes('qr.width = 124;'));
assert(source.includes('qr.height = 124;'));
assert(source.includes('session?.card_color'));
assert(source.includes('background: #e8fff6;'));
assert(source.includes('border: 1px solid #48d7a3;'));
assert(source.includes('color: #087a61;'));
assert(source.includes('color: #ffd966;'));
assert(source.includes('background: #cc0000;'));
assert(source.includes('flex: 0 0 154px;'));

assert(source.includes('const WEEKLY_CALENDAR_PAGE_SIZE = 2;'), 'weekly sessions must paginate without shrinking their QR codes');
assert(source.includes('option value="abbreviation">Abbreviation only'));
assert(source.includes('option value="location">Abbreviation + city'));
assert(source.includes("className = 'weekly-calendar-session-timezone'"));
assert(source.includes('Times in ${sessionLabels.join(\' | \')}'));
assert(source.includes("className = 'weekly-calendar-session-title'"));
assert(source.includes("className = 'weekly-calendar-condition'"));
assert(source.includes("className = 'weekly-calendar-speaker'"));
assert(source.includes("className = 'weekly-calendar-register-cta'"));
assert(source.includes("return { pxW: 1440, pxH: 1800, wIn: 4.8, hIn: 6, tag: '4.8x6', orientation: 'portrait' }"));
assert(source.includes("return { pxW: 1200, pxH: 1800, wIn: 4, hIn: 6, tag: '4x6', orientation: 'portrait' }"), 'monthly export dimensions must remain unchanged');

console.log('weekly calendar ISO-week, filters, drafts, multi-zone grouping/captions, API alias/QR source, template styling, and export checks passed');
