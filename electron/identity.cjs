// Branding may change; the Chromium profile is a persistent compatibility ID.
// Keeping the original directory also lets older installations read the same saves.
const path = require('node:path');
const fs = require('node:fs');
const APP_ID = 'com.larper48.game';
const LEGACY_PROFILE = 'Floor 48';
function configureIdentity(app) {
  const profile = path.join(app.getPath('appData'), LEGACY_PROFILE);
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  app.setAppUserModelId(APP_ID);
}
// Existing automation/benchmark scripts using F48_* continue working.
function option(key, env = process.env) { return env[`L48_${key}`] ?? env[`F48_${key}`]; }
module.exports = { APP_ID, LEGACY_PROFILE, configureIdentity, option };
