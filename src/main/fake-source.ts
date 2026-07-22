import type { Cue, SiteId, TrackInfo } from '../core/contracts';
import {
  cuesMessage,
  isDuetSubMessage,
  postDuetSubMessage,
  tracksMessage,
} from '../core/messages';

const TRACKS: readonly TrackInfo[] = [
  {
    id: 'walking-skeleton-en',
    language: 'en',
    source: 'official',
    label: 'Fake official English',
  },
  {
    id: 'walking-skeleton-zh-Hant',
    language: 'zh-Hant',
    source: 'official',
    label: 'Fake MT Traditional Chinese',
  },
];

export function startFakeMainStub(siteId: SiteId): void {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isDuetSubMessage(event.data)) return;
    if (
      event.data.direction !== 'isolated-to-main' ||
      event.data.type !== 'request-fake-data' ||
      event.data.siteId !== siteId
    ) {
      return;
    }

    const envelope = { siteId, requestId: event.data.requestId };
    const { english, chinese } = createFakeCues(event.data.anchorTimeMs);

    postDuetSubMessage(tracksMessage(envelope, TRACKS));
    postDuetSubMessage(
      cuesMessage(
        envelope,
        {
          role: 'english',
          trackId: TRACKS[0].id,
          cues: english,
          translation: 'official',
        },
      ),
    );
    postDuetSubMessage(
      cuesMessage(
        envelope,
        {
          role: 'chinese',
          trackId: TRACKS[1].id,
          cues: chinese,
          translation: 'mt-fallback',
        },
      ),
    );
  });
}

function createFakeCues(anchorTimeMs: number): {
  english: Cue[];
  chinese: Cue[];
} {
  const at = Math.max(0, Math.round(anchorTimeMs));
  return {
    english: [
      cue(at, at + 4_000, 'One English cue spans two Chinese cues.', 'en'),
      cue(at + 4_000, at + 6_000, 'English-only cue.', 'en'),
      cue(at + 8_000, at + 12_000, 'English stays above at the top.', 'en'),
    ],
    chinese: [
      cue(at, at + 2_000, '一對多：第一條繁中假字幕。', 'zh-Hant'),
      cue(at + 2_000, at + 4_000, '一對多：第二條繁中假字幕。', 'zh-Hant'),
      cue(at + 6_000, at + 8_000, '單側繁中假字幕。', 'zh-Hant'),
      cue(
        at + 8_000,
        at + 12_000,
        '置頂時仍然是繁中在下。',
        'zh-Hant',
        'top',
      ),
    ],
  };
}

function cue(
  start: number,
  end: number,
  text: string,
  language: string,
  position?: Cue['position'],
): Cue {
  return position === undefined
    ? { start, end, text, language }
    : { start, end, text, language, position };
}
