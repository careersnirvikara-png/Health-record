# Standalone health records UAT

Live URL: https://healthrecordloginuat.pages.dev

Run `npm install`, authorize with `npx wrangler login`, then run `npm run deploy`.
The bucket and Pages project have already been created; do not recreate them.

## Environment configuration

- `deployment.config.json`: target Cloudflare account. All npm scripts use this
  account explicitly, regardless of other accounts available to the login.
- `wrangler.toml`: Pages project, R2 bucket binding, server limits and CORS origins.
- `public/config.js`: public API base URL and client limits. Never put secrets here.

UAT uses a separate R2 bucket and does not reference the production API.
The browser accepts 2 MB per file while the server accepts 200 MB, preserving the
existing limits. Set both configuration files deliberately when changing limits.

To promote to production, review these configuration files and deployment scripts
for the production project name, account and bucket before deploying. This is a
Pages Functions deployment; do not overwrite the existing production Worker
configuration with it without planning that migration.

No custom domain or production DNS has been changed. To add `uat.nirvikara.com`,
first register it under this Pages project's Custom domains and follow the
Cloudflare-provided DNS instructions in the account managing `nirvikara.com`.

Use synthetic test records only. The copied application identifies users by
email parameters, not verified authentication; CORS is not access control.
