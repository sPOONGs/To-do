import AsyncStorage from '@react-native-async-storage/async-storage';

export const storageKeys = {
  schedules: '@my_time/schedules', categories: '@my_time/categories',
  theme: '@my_time/theme', later: '@my_time/to_later_v1',
};
export const legacyBackupKey = '@dalvi/backup/pre_home_dream_v1';

// Preserve raw values, including invalid data, before any migration writes.
export async function preserveLegacyData() {
  if (await AsyncStorage.getItem(legacyBackupKey) !== null) return;
  const values = await AsyncStorage.multiGet(Object.values(storageKeys));
  await AsyncStorage.setItem(legacyBackupKey, JSON.stringify({ createdAt: new Date().toISOString(), values }));
}

const pendingWrites = new Map<string, Promise<void>>();
// A slower old save must never replace a newer edit.
export function storePlannerValue(key: string, value: string): Promise<void> {
  const write = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(() => AsyncStorage.setItem(key, value));
  pendingWrites.set(key, write);
  void write.finally(() => { if (pendingWrites.get(key) === write) pendingWrites.delete(key); }).catch(() => {});
  return write;
}
