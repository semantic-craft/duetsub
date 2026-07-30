import {
  DEFAULT_LANGUAGE_PAIR_PREFERENCE,
  normalizeLanguagePairPreference,
  type LanguagePairPreference,
} from './official-pair-selection';

export const OFFICIAL_LANGUAGE_PAIR_STORAGE_KEY =
  'duetsub:official-language-pair:v1';

export interface OfficialPairStoragePort {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface LoadedLanguagePairPreference {
  readonly preference: LanguagePairPreference;
  readonly stored: boolean;
}

export async function loadLanguagePairPreference(
  storage: OfficialPairStoragePort,
): Promise<LoadedLanguagePairPreference> {
  const stored = await storage.get(OFFICIAL_LANGUAGE_PAIR_STORAGE_KEY);
  const preference = normalizeLanguagePairPreference(
    stored[OFFICIAL_LANGUAGE_PAIR_STORAGE_KEY],
  );
  return preference === undefined
    ? { preference: DEFAULT_LANGUAGE_PAIR_PREFERENCE, stored: false }
    : { preference, stored: true };
}

export async function saveLanguagePairPreference(
  storage: OfficialPairStoragePort,
  value: unknown,
): Promise<boolean> {
  const preference = normalizeLanguagePairPreference(value);
  if (preference === undefined) return false;
  await storage.set({ [OFFICIAL_LANGUAGE_PAIR_STORAGE_KEY]: preference });
  return true;
}

export async function resetLanguagePairPreference(
  storage: OfficialPairStoragePort,
): Promise<void> {
  await storage.remove(OFFICIAL_LANGUAGE_PAIR_STORAGE_KEY);
}
