const { spawnSync } = require('node:child_process');
const config = require('./deployment.config.json');

if (!/^[a-f0-9]{32}$/.test(config.accountId)) {
  throw new Error('deployment.config.json must contain a valid Cloudflare accountId');
}

const result = spawnSync(process.execPath, [
  require.resolve('wrangler/bin/wrangler.js'),
  ...process.argv.slice(2)
], {
  stdio: 'inherit',
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.accountId }
});

if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
