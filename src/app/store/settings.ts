import { createLocalStore, isRecord } from './localStore';

export interface Settings {
  sound: boolean;
}

export const settingsStore = createLocalStore<Settings>(
  'bb:settings',
  { sound: false },
  (v): v is Settings => isRecord(v) && typeof v['sound'] === 'boolean',
);

export const useSettings = settingsStore.use;
