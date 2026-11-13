const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('index.html', 'utf8');

const fetchStart = source.indexOf('async function fetchCalendarJson');
const fetchEnd = source.indexOf('\nfunction renderCalendarLoadError', fetchStart);
assert(fetchStart >= 0 && fetchEnd > fetchStart, 'calendar JSON fetch helper must be present');

const timeoutValues = [];
const fetchRequests = [];
const fakeWindow = {
  setTimeout(callback, milliseconds) {
    timeoutValues.push(milliseconds);
    callback();
    return timeoutValues.length;
  },
  clearTimeout() {}
};
const fakeFetch = async (url, options) => {
  fetchRequests.push({ url, cache: options.cache });
  if (options.signal.aborted) {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  }
  return new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
};
const fetchCalendarJson = new Function(
  'CALENDAR_REQUEST_TIMEOUT_MS',
  'window',
  'fetch',
  'AbortController',
  `${source.slice(fetchStart, fetchEnd)} return fetchCalendarJson;`
)(10000, fakeWindow, fakeFetch, AbortController);

const timeoutChecks = async () => {
  await assert.rejects(fetchCalendarJson('/sessions', 'Sessions'), /timed out after 10 seconds/);
  await assert.rejects(
    fetchCalendarJson('/sessions?uuid=session-1', 'Registration link', 'no-store', 30000),
    /timed out after 30 seconds/,
  );
  assert.deepStrictEqual(timeoutValues, [10000, 30000], 'registration details must use their own longer deadline');
  assert.deepStrictEqual(fetchRequests.map(request => request.cache), ['default', 'no-store']);
};

const aliasStart = source.indexOf('async function getWeeklySessionWithAlias');
const aliasEnd = source.indexOf('\nfunction retryWeeklyCalendarRegistrationLinks', aliasStart);
assert(aliasStart >= 0 && aliasEnd > aliasStart, 'weekly registration cache helper must be present');

function makeAliasLoader(fetchDetail, validateQr, caches) {
  return new Function(
    'weeklySessionAliasCache',
    'weeklySessionAliasPromises',
    'weeklyQrDataUrlCache',
    'getWeeklySessionAliasApiUrl',
    'fetchCalendarJson',
    'getWeeklySessionRegistrationAssets',
    'validateWeeklyRegistrationQr',
    'REGISTRATION_LINK_REQUEST_TIMEOUT_MS',
    `${source.slice(aliasStart, aliasEnd)} return getWeeklySessionWithAlias;`
  )(
    caches.aliases,
    caches.promises,
    caches.qrs,
    session => `/sessions?uuid=${session.uuid}`,
    fetchDetail,
    detail => ({ shortUrl: detail.qr_payload_url, qrSrc: detail.qr_base64 }),
    validateQr,
    30000,
  );
}

const dedupAndCacheChecks = async () => {
  const caches = { aliases: new Map(), promises: new Map(), qrs: new Map() };
  let fetchCount = 0;
  let resolveDetail;
  let resolveQr;
  let validationStarted = false;
  const fetchDetail = (url, label, cacheMode, timeoutMs) => {
    fetchCount += 1;
    assert.strictEqual(label, 'Registration link');
    assert.strictEqual(cacheMode, 'no-store');
    assert.strictEqual(timeoutMs, 30000);
    return new Promise(resolve => { resolveDetail = resolve; });
  };
  const validateQr = () => new Promise(resolve => {
    validationStarted = true;
    resolveQr = resolve;
  });
  const getSession = makeAliasLoader(fetchDetail, validateQr, caches);
  const session = { uuid: 'session-1', title: 'Week 47 session' };
  const first = getSession(session);
  const duplicate = getSession(session);
  assert.strictEqual(fetchCount, 1, 'concurrent renders must share one registration request');

  resolveDetail({ data: [{
    uuid: session.uuid,
    qr_payload_url: 'https://local-sttt.somebodytotalkto.com/s/alias-1',
    tracked_registration_url: 'https://local-sttt.somebodytotalkto.com/r/' + 'a'.repeat(43),
    qr_base64: 'data:image/png;base64,original'
  }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(validationStarted, true);
  assert.strictEqual(caches.aliases.size, 0, 'an alias must not be cached before its QR passes validation');
  assert.strictEqual(caches.qrs.size, 0, 'a QR must not be cached before validation finishes');

  resolveQr('data:image/png;base64,validated');
  const [firstResult, duplicateResult] = await Promise.all([first, duplicate]);
  assert.strictEqual(firstResult, duplicateResult);
  assert.strictEqual(caches.aliases.get(session.uuid).weekly_qr_src, 'data:image/png;base64,validated');
  assert.strictEqual(caches.qrs.get('https://local-sttt.somebodytotalkto.com/s/alias-1'), 'data:image/png;base64,validated');
};

const staleRequestChecks = async () => {
  const caches = { aliases: new Map(), promises: new Map(), qrs: new Map() };
  const detailResolvers = [];
  let validationCount = 0;
  const fetchDetail = () => new Promise(resolve => detailResolvers.push(resolve));
  const validateQr = async dataUrl => {
    validationCount += 1;
    return dataUrl;
  };
  const getSession = makeAliasLoader(fetchDetail, validateQr, caches);
  const session = { uuid: 'session-race' };
  const stale = getSession(session);
  await new Promise(resolve => setImmediate(resolve));
  caches.promises.delete(session.uuid);
  const current = getSession(session);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(detailResolvers.length, 2, 'a new retry should own a distinct in-flight request');

  detailResolvers[0]({ data: [{
    uuid: session.uuid,
    qr_payload_url: 'https://local-sttt.somebodytotalkto.com/s/stale',
    tracked_registration_url: 'https://local-sttt.somebodytotalkto.com/r/' + 'b'.repeat(43),
    qr_base64: 'data:image/png;base64,stale'
  }] });
  await stale;
  assert.strictEqual(caches.aliases.has(session.uuid), false, 'a stale request must not repopulate the alias cache');
  assert.strictEqual(caches.qrs.has('https://local-sttt.somebodytotalkto.com/s/stale'), false);

  detailResolvers[1]({ data: [{
    uuid: session.uuid,
    qr_payload_url: 'https://local-sttt.somebodytotalkto.com/s/current',
    tracked_registration_url: 'https://local-sttt.somebodytotalkto.com/r/' + 'c'.repeat(43),
    qr_base64: 'data:image/png;base64,current'
  }] });
  await current;
  assert.strictEqual(validationCount, 2);
  assert.strictEqual(caches.aliases.get(session.uuid).weekly_short_url, 'https://local-sttt.somebodytotalkto.com/s/current');
  assert.strictEqual(caches.qrs.has('https://local-sttt.somebodytotalkto.com/s/current'), true);
};

const retryStart = source.indexOf('function retryWeeklyCalendarRegistrationLinks');
const retryEnd = source.indexOf('\nfunction calendarFormatWeeklySessionDate', retryStart);
assert(retryStart >= 0 && retryEnd > retryStart, 'weekly registration retry handler must be present');

const selectiveRetryChecks = async () => {
  const rows = [{ uuid: 'session-failed' }, { uuid: 'session-ok' }];
  const aliases = new Map([
    ['session-failed', { weekly_short_url: 'https://local-sttt.somebodytotalkto.com/s/failed' }],
    ['session-ok', { weekly_short_url: 'https://local-sttt.somebodytotalkto.com/s/ok' }]
  ]);
  const promises = new Map([['session-failed', Promise.resolve()], ['session-ok', Promise.resolve()]]);
  const qrs = new Map([
    ['https://local-sttt.somebodytotalkto.com/s/failed', 'bad-qr'],
    ['https://local-sttt.somebodytotalkto.com/s/ok', 'good-qr']
  ]);
  let renderArgument;
  const retry = new Function(
    'calendarGetWeeklySessions',
    'calendarSessionsData',
    'selectedWeeklyPage',
    'WEEKLY_CALENDAR_PAGE_SIZE',
    'weeklyRegistrationRetrySessionUuids',
    'weeklySessionAliasCache',
    'weeklySessionAliasPromises',
    'weeklyQrDataUrlCache',
    'getApprovedRegistrationShortUrl',
    'renderWeeklyCalendarSessions',
    `${source.slice(retryStart, retryEnd)} return retryWeeklyCalendarRegistrationLinks;`
  )(
    input => input,
    { sessions: rows },
    0,
    2,
    new Set(['session-failed']),
    aliases,
    promises,
    qrs,
    value => value,
    value => { renderArgument = value; return Promise.resolve(value); },
  );

  await retry();
  assert.strictEqual(aliases.has('session-failed'), false);
  assert.strictEqual(promises.has('session-failed'), false);
  assert.strictEqual(qrs.has('https://local-sttt.somebodytotalkto.com/s/failed'), false);
  assert.strictEqual(aliases.has('session-ok'), true, 'successful session aliases must remain cached after a partial failure');
  assert.strictEqual(promises.has('session-ok'), true);
  assert.strictEqual(qrs.get('https://local-sttt.somebodytotalkto.com/s/ok'), 'good-qr');
  assert.strictEqual(renderArgument, true);
};

(async () => {
  await timeoutChecks();
  await dedupAndCacheChecks();
  await staleRequestChecks();
  await selectiveRetryChecks();
  console.log('weekly registration timeout, concurrency, validated-cache, stale-request, and selective-retry checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
