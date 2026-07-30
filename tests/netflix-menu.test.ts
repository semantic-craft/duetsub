import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../src/core/contracts';
import {
  parseNetflixMenuOptionMetadata,
  resolveNetflixMenuTrackKey,
} from '../src/adapters/netflix';

function track(
  id: string,
  language: string,
  kind: TrackInfo['kind'],
): TrackInfo {
  return {
    id,
    language,
    source: 'official',
    label: id,
    kind,
  };
}

describe('Netflix subtitle menu metadata', () => {
  it('reads arbitrary machine BCP-47 codes without guessing localized labels', () => {
    expect(
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-selected-ja-JP',
        label: '日本語',
        selected: true,
      }),
    ).toMatchObject({
      language: 'ja-JP',
      kind: 'subtitles',
      selected: true,
    });
    expect(
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-sr-Latn-RS-cc',
        label: 'Српски',
        selected: false,
      }),
    ).toMatchObject({
      language: 'sr-Latn-RS',
      kind: 'closed-captions',
    });
    expect(
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-selected-日本語',
        label: '日本語',
        selected: true,
      }),
    ).toMatchObject({
      language: undefined,
    });
  });

  it('excludes off and forced-only options from official tracks', () => {
    expect(
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-off',
        label: '關閉',
        selected: true,
      }),
    ).toMatchObject({ off: true });
    expect(
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-fr-forced',
        label: 'Français',
        selected: false,
      }),
    ).toMatchObject({ language: 'fr', forcedOnly: true });
  });

  it('matches manifest tracks by structured language and variant only', () => {
    const options = [
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-ja',
        label: '日本語',
        selected: false,
      })!,
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-ja-cc',
        label: '日本語',
        selected: false,
      })!,
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-zh-Hans',
        label: '简体中文',
        selected: true,
      })!,
    ];

    expect(
      resolveNetflixMenuTrackKey(
        track('manifest-ja', 'ja-JP', 'subtitles'),
        options,
      ),
    ).toBe(options[0].key);
    expect(
      resolveNetflixMenuTrackKey(
        track('manifest-ja-cc', 'ja', 'closed-captions'),
        options,
      ),
    ).toBe(options[1].key);
  });

  it('fails closed when structured variant metadata is ambiguous', () => {
    const options = [
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-item-de',
        label: 'Deutsch',
        selected: false,
      })!,
      parseNetflixMenuOptionMetadata({
        dataUia: 'subtitle-option-de',
        label: 'Deutsch für Dialoge',
        selected: false,
      })!,
    ];

    expect(
      resolveNetflixMenuTrackKey(
        track('manifest-de', 'de', 'subtitles'),
        options,
      ),
    ).toBeUndefined();
  });

  it('never treats bare Chinese as a scripted Chinese menu handle', () => {
    const bareChinese = parseNetflixMenuOptionMetadata({
      dataUia: 'subtitle-item-zh',
      label: '中文',
      selected: false,
    })!;

    expect(
      resolveNetflixMenuTrackKey(
        track('manifest-simplified', 'zh-Hans', 'subtitles'),
        [bareChinese],
      ),
    ).toBeUndefined();
    expect(
      resolveNetflixMenuTrackKey(
        track('manifest-traditional', 'zh-Hant', 'subtitles'),
        [bareChinese],
      ),
    ).toBeUndefined();
  });
});
