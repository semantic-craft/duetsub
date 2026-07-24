import type { Cue } from './contracts';

export interface WebVttParserOptions {
  readonly language: string;
  readonly presentationAnchor?: {
    readonly mpegTs: number;
    readonly presentationTimeMs: number;
  };
}

export function parseWebVtt(
  raw: string,
  options: WebVttParserOptions,
): Cue[] {
  if (options.language.length === 0) return [];

  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('WEBVTT')) return [];
  const timestampOffset = readTimestampOffset(
    normalized,
    options.presentationAnchor,
  );
  if (timestampOffset === undefined) return [];

  const blocks = normalized.split(/\n{2,}/);
  const topRegions = collectTopRegions(blocks);
  const cues: Cue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (
      lines[0]?.startsWith('WEBVTT') ||
      lines[0] === 'REGION' ||
      lines[0]?.startsWith('NOTE') ||
      lines[0] === 'STYLE'
    ) {
      continue;
    }

    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const timing = parseTimingLine(lines[timingIndex]);
    const text = normalizeCueText(lines.slice(timingIndex + 1).join('\n'));
    if (
      timing === undefined ||
      timing.end <= timing.start ||
      text.length === 0
    ) {
      continue;
    }

    const start = timing.start + timestampOffset;
    const end = timing.end + timestampOffset;
    if (start < 0 || end <= start) continue;

    const cue: Cue = {
      start,
      end,
      text,
      language: options.language,
    };
    cues.push(
      isTopPosition(timing.settings, topRegions)
        ? { ...cue, position: 'top' }
        : cue,
    );
  }

  return cues.toSorted((left, right) => left.start - right.start);
}

interface TimingLine {
  readonly start: number;
  readonly end: number;
  readonly settings: string;
}

const MPEG_TS_WRAP = 2 ** 33;

function readTimestampOffset(
  raw: string,
  anchor: WebVttParserOptions['presentationAnchor'],
): number | undefined {
  const line = raw.match(/^X-TIMESTAMP-MAP=(.+)$/m)?.[1];
  if (line === undefined) return 0;
  const local = line.match(/(?:^|,)LOCAL:([^,]+)/)?.[1];
  const mpegTs = line.match(/(?:^|,)MPEGTS:(\d+)/)?.[1];
  if (local === undefined || mpegTs === undefined) return undefined;

  const localTimeMs = parseTimestamp(local);
  const mappedMpegTs = Number(mpegTs);
  if (
    localTimeMs === undefined ||
    !Number.isSafeInteger(mappedMpegTs) ||
    mappedMpegTs < 0 ||
    mappedMpegTs >= MPEG_TS_WRAP
  ) {
    return undefined;
  }
  if (localTimeMs === 0 && mappedMpegTs === 0) return 0;
  if (
    anchor === undefined ||
    !Number.isSafeInteger(anchor.mpegTs) ||
    anchor.mpegTs < 0 ||
    anchor.mpegTs >= MPEG_TS_WRAP ||
    !Number.isFinite(anchor.presentationTimeMs)
  ) {
    return undefined;
  }

  const delta = unwrapMpegTsDelta(mappedMpegTs - anchor.mpegTs);
  return anchor.presentationTimeMs + delta / 90 - localTimeMs;
}

function unwrapMpegTsDelta(delta: number): number {
  const wrapped = ((delta % MPEG_TS_WRAP) + MPEG_TS_WRAP) % MPEG_TS_WRAP;
  return wrapped > MPEG_TS_WRAP / 2 ? wrapped - MPEG_TS_WRAP : wrapped;
}

function collectTopRegions(blocks: readonly string[]): ReadonlySet<string> {
  const result = new Set<string>();

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines[0] !== 'REGION') continue;

    const id = readRegionField(lines, 'id');
    const viewportAnchor = readRegionField(lines, 'viewportanchor');
    const verticalPercent = viewportAnchor
      ?.match(/^\s*-?(?:\d+(?:\.\d+)?|\.\d+)%\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))%\s*$/)
      ?.[1];
    if (
      id !== undefined &&
      verticalPercent !== undefined &&
      Number(verticalPercent) < 50
    ) {
      result.add(id);
    }
  }

  return result;
}

function readRegionField(
  lines: readonly string[],
  name: string,
): string | undefined {
  const prefix = `${name}:`;
  return lines
    .find((line) => line.toLowerCase().startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function parseTimingLine(line: string): TimingLine | undefined {
  const match = line.match(/^(\S+)\s+-->\s+(\S+)(?:\s+(.*))?$/);
  if (match === null) return undefined;

  const start = parseTimestamp(match[1]);
  const end = parseTimestamp(match[2]);
  return start === undefined || end === undefined
    ? undefined
    : { start, end, settings: match[3] ?? '' };
}

function parseTimestamp(value: string): number | undefined {
  const parts = value.split(':');
  if (parts.length !== 2 && parts.length !== 3) return undefined;

  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const minutes = Number(parts.at(-2));
  const secondMatch = parts.at(-1)?.match(/^(\d{2})\.(\d{3})$/);
  if (
    !Number.isInteger(hours) ||
    hours < 0 ||
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    minutes >= 60 ||
    secondMatch === null ||
    secondMatch === undefined
  ) {
    return undefined;
  }

  const seconds = Number(secondMatch[1]);
  if (seconds >= 60) return undefined;
  return ((hours * 60 + minutes) * 60 + seconds) * 1_000 +
    Number(secondMatch[2]);
}

function normalizeCueText(raw: string): string {
  return decodeEntities(
    raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[\s\u00a0]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: '\u00a0',
    quot: '"',
  };

  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (entity, decimal: string, hexadecimal: string, name: string) => {
      const codePoint = decimal !== undefined
        ? Number(decimal)
        : hexadecimal !== undefined
          ? Number.parseInt(hexadecimal, 16)
          : undefined;
      if (codePoint !== undefined) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      }
      return named[name.toLowerCase()] ?? entity;
    },
  );
}

function isTopPosition(
  settings: string,
  topRegions: ReadonlySet<string>,
): boolean {
  const region = settings.match(/(?:^|\s)region:(\S+)/)?.[1];
  if (region !== undefined && topRegions.has(region)) return true;

  const line = settings.match(/(?:^|\s)line:([^,\s]+)/)?.[1];
  if (line === undefined || line === 'auto') return false;
  if (line.endsWith('%')) {
    const percent = Number(line.slice(0, -1));
    return Number.isFinite(percent) && percent < 50;
  }
  const number = Number(line);
  return Number.isInteger(number) && number >= 0;
}
