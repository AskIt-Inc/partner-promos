# Facebook Promo v2

Standalone static HTML page for the Facebook promo card.

## Local preview

Generate the ignored local runtime file, then open `index.html` in a browser:

```bash
node scripts/generate-runtime-config.js --environment=local
```

Local generation uses `https://local-sttt.somebodytotalkto.com:8443`.
Production Pages builds require the repository environment variable
`STTT_PUBLIC_BASE_URL=https://somebodytotalkto.com`; the build fails when it is
missing, invalid, loopback, or local-only. The generated `runtime-config.js` is
uploaded in the Pages artifact and is never committed.
