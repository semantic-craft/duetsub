import type { Cue } from './contracts';

interface Json3Segment {
  readonly utf8?: unknown;
}

interface Json3Event {
  readonly tStartMs?: unknown;
  readonly dDurationMs?: unknown;
  readonly segs?: unknown;
  readonly aAppend?: unknown;
}

interface Json3Document {
  readonly events?: unknown;
}

export function parseYoutubeJson3(raw: string, language: string): Cue[] {
  let document: Json3Document;
  try {
    document = JSON.parse(raw) as Json3Document;
  } catch {
    return [];
  }
  if (!Array.isArray(document.events)) return [];

  const cues: Cue[] = [];
  for (const candidate of document.events) {
    const event = candidate as Json3Event;
    if (
      typeof event.tStartMs !== 'number' ||
      !Number.isFinite(event.tStartMs) ||
      typeof event.dDurationMs !== 'number' ||
      !Number.isFinite(event.dDurationMs) ||
      !Array.isArray(event.segs) ||
      event.aAppend === 1
    ) {
      continue;
    }
    const text = (event.segs as Json3Segment[])
      .map(({ utf8 }) => typeof utf8 === 'string' ? utf8 : '')
      .join('');
    if (text.trim() === '') continue;
    cues.push({
      start: event.tStartMs,
      end: event.tStartMs + event.dDurationMs,
      text,
      language,
    });
  }
  return cues;
}
