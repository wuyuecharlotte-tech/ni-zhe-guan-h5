import cloudbase from '@cloudbase/js-sdk';

let rdb;

// Call only when the game declares PostgreSQL persistence. Demo-only games need
// no database initialization. Credentials are injected into the service version.
export function getRdb() {
  if (rdb) return rdb;
  const env = process.env.CLOUDBASE_ENV_ID?.trim();
  const accessKey = process.env.CLOUDBASE_APIKEY?.trim();
  const region = process.env.CLOUDBASE_REGION?.trim();
  if (!env || !accessKey || !region) {
    throw new Error('PERSISTENCE_CONFIG_MISSING: platform CloudBase runtime configuration is required');
  }
  rdb = cloudbase.init({ env, accessKey, region, timeout: 10000 }).rdb();
  return rdb;
}
