Goal:
Load base64 session assets only after a user selects a session, while preserving the Partner Back Card's upcoming-series month.

Current status:
Complete locally; not yet merged or pushed.

Confirmed decisions:
- Session selectors and Partner Back Card month lookups request `base64=no&view=summary`.
- A selected session is refreshed by its UUID with `base64=yes&view=full`.

Relevant files:
- `index.html`

Changes completed:
- Added a shared URL builder for session API request variants.
- Switched the Partner Back Card month lookup to the lightweight response.

Verification:
- Houston Methodist summary endpoint returns a small response with upcoming session dates.

Remaining work:
- Merge and push if requested.

Next recommended action:
- Verify the Partner Back Card shows the next session month and year after deployment.
