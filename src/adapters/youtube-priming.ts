type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface RestorableYoutubeCaptionState {
  readonly enabled: boolean;
  readonly track: { readonly [key: string]: JsonValue };
}

export function nextYoutubeEmptyBodyAction(
  rePrimeAttempts: number,
): 'reprime' | 'fail-closed' {
  return rePrimeAttempts === 0 ? 'reprime' : 'fail-closed';
}

export function readRestorableYoutubeCaptionState(
  value: unknown,
): RestorableYoutubeCaptionState | undefined {
  if (!isJsonRecord(value)) return undefined;
  const track = cloneJsonRecord(value);
  const keys = Object.keys(track);
  if (keys.length === 0) return { enabled: false, track };
  return typeof track.languageCode === 'string' &&
      track.languageCode.trim() !== ''
    ? { enabled: true, track }
    : undefined;
}

export function isYoutubeCaptionStateRestored(
  expected: RestorableYoutubeCaptionState,
  observed: unknown,
): boolean {
  const restored = readRestorableYoutubeCaptionState(observed);
  return restored !== undefined &&
    restored.enabled === expected.enabled &&
    equalJson(restored.track, expected.track);
}

function isJsonRecord(
  value: unknown,
): value is Record<string, JsonValue> {
  if (!isPlainRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonRecord(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJsonRecord(
  value: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]),
  );
}

function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        cloneJson(entry as JsonValue),
      ]),
    );
  }
  return value;
}

function equalJson(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => equalJson(entry, right[index]));
  }
  if (isPlainRecord(left) || isPlainRecord(right)) {
    if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) =>
        key === rightKeys[index] &&
        equalJson(left[key] as JsonValue, right[key] as JsonValue)
      );
  }
  return false;
}
