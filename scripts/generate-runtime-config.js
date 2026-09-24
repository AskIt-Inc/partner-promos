#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LOCAL_PUBLIC_BASE_URL = 'https://local-sttt.somebodytotalkto.com:8443';
const PRODUCTION_PUBLIC_BASE_URL = 'https://somebodytotalkto.com';

function readArgument(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find(argument => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function normalizePublicBaseUrl(value, environment) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    throw new Error('STTT_PUBLIC_BASE_URL is required.');
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  }
  catch {
    throw new Error('STTT_PUBLIC_BASE_URL must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
    || (parsed.pathname !== '/' && parsed.pathname !== '')
    || parsed.search || parsed.hash) {
    throw new Error('STTT_PUBLIC_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const localOnly = hostname === 'localhost'
    || hostname === '::1'
    || hostname === '0.0.0.0'
    || hostname.startsWith('127.')
    || hostname.startsWith('local-')
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.test')
    || hostname.endsWith('.ddev.site');

  if (environment === 'production' && localOnly) {
    throw new Error('Production runtime configuration cannot use a local-only or loopback host.');
  }

  const origin = parsed.origin;
  const requiredOrigin = environment === 'production'
    ? PRODUCTION_PUBLIC_BASE_URL
    : LOCAL_PUBLIC_BASE_URL;
  if (origin !== requiredOrigin) {
    throw new Error(`The ${environment} runtime must use its approved STTT public origin.`);
  }

  return origin;
}

function validateRuntimeConfig(config) {
  if (!config || !['local', 'production'].includes(config.environment)) {
    throw new Error('Runtime configuration has an unsupported environment.');
  }
  return {
    environment: config.environment,
    stttPublicBaseUrl: normalizePublicBaseUrl(config.stttPublicBaseUrl, config.environment),
  };
}

const checkFile = readArgument('check');
if (checkFile) {
  const source = fs.readFileSync(path.resolve(checkFile), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: checkFile });
  validateRuntimeConfig(context.window.STTT_PROMO_RUNTIME_CONFIG);
  process.stdout.write('Runtime configuration is valid.\n');
  process.exit(0);
}

const environment = readArgument('environment', process.env.PROMO_ENVIRONMENT || 'local');
if (!['local', 'production'].includes(environment)) {
  throw new Error('PROMO_ENVIRONMENT must be local or production.');
}

const configuredBaseUrl = process.env.STTT_PUBLIC_BASE_URL
  || (environment === 'local' ? LOCAL_PUBLIC_BASE_URL : '');
const config = validateRuntimeConfig({
  environment,
  stttPublicBaseUrl: configuredBaseUrl,
});
const outputFile = path.resolve(readArgument('output', 'runtime-config.js'));
const output = `window.STTT_PROMO_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
fs.writeFileSync(outputFile, output, { encoding: 'utf8', mode: 0o644 });
process.stdout.write(`Generated runtime configuration for ${environment}.\n`);
