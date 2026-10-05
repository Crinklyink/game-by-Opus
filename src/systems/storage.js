// These are a versioned storage contract, not product branding. Do not rename.
export const SAVE_KEY = 'floor48.save.v1';
export const SETTINGS_KEY = 'floor48.settings';
export const CONTINUE_KEY = 'floor48.continue';
export const BACKUP_KEY = 'larper48.beforeImport.v1';

export function exportBackup(storage) {
  return JSON.stringify({ format: 'larper48-backup', version: 1,
    save: storage.getItem(SAVE_KEY), settings: storage.getItem(SETTINGS_KEY) }, null, 2);
}

export function importBackup(text, storage) {
  const b = JSON.parse(text);
  if (b.format !== 'larper48-backup' || b.version !== 1 || typeof b.save !== 'string') throw new Error('Choose a Larper 48 save backup.');
  const d = JSON.parse(b.save);
  if (!d || d.state?.v !== 1 || !Number.isFinite(d.state.cash) || !d.market || !Array.isArray(d.market.prices) || !d.pos ||
      !['x', 'y', 'z', 'yaw'].every((k) => Number.isFinite(d.pos[k])) || ![0, 1].includes(d.pos.level)) throw new Error('The save backup is invalid.');
  if (b.settings !== null && typeof b.settings !== 'string') throw new Error('Invalid settings backup.');
  if (b.settings !== null) {
    const s = JSON.parse(b.settings);
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('Invalid settings backup.');
  }
  // Retain the previous data before either write; roll back if storage fills up.
  const previous = exportBackup(storage);
  storage.setItem(BACKUP_KEY, previous);
  try {
    if (b.settings !== null) storage.setItem(SETTINGS_KEY, b.settings);
    storage.setItem(SAVE_KEY, b.save);
  } catch (error) {
    const old = JSON.parse(previous);
    for (const [key, value] of [[SAVE_KEY, old.save], [SETTINGS_KEY, old.settings]]) {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
    }
    throw error;
  }
}
