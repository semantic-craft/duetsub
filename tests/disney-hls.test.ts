import { describe, expect, it } from 'vitest';

import {
  parseDisneyMasterManifest,
  parseDisneySubtitlePlaylist,
} from '../src/adapters/disney-hls';

const MASTER_URL =
  'https://vod-edge.media.dssott.com/signed/title/master.m3u8?token=placeholder';

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub-main",NAME="Chinese (Traditional)",LANGUAGE="zh-Hant",AUTOSELECT=YES,FORCED=NO,CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog",URI="r/composite_zh-Hant_NORMAL.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub-main",NAME="English [CC]",LANGUAGE="en",AUTOSELECT=YES,FORCED=NO,CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog,public.accessibility.describes-music-and-sound",URI="r/composite_en_SDH.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub-main",NAME="English forced",LANGUAGE="en",AUTOSELECT=YES,FORCED=YES,URI="r/composite_en_FORCED.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="r/audio.m3u8"
`;

describe('Disney+ HLS mapping', () => {
  it('maps normal, CC and forced official tracks from the master manifest', () => {
    const parsed = parseDisneyMasterManifest(MASTER, MASTER_URL);

    expect(parsed?.tracks).toEqual([
      {
        id: 'zh-Hant:normal',
        language: 'zh-Hant',
        source: 'official',
        label: 'Chinese (Traditional)',
        kind: 'subtitles',
      },
      {
        id: 'en:cc',
        language: 'en',
        source: 'official',
        label: 'English [CC]',
        kind: 'closed-captions',
      },
      {
        id: 'en:forced',
        language: 'en',
        source: 'official',
        label: 'English forced',
        kind: 'subtitles',
        forcedOnly: true,
      },
    ]);
    expect(parsed?.resources['zh-Hant:normal']?.playlistUrl).toBe(
      'https://vod-edge.media.dssott.com/signed/title/r/composite_zh-Hant_NORMAL.m3u8',
    );
  });

  it('fails closed on lookalike hosts and duplicate track identities', () => {
    expect(
      parseDisneyMasterManifest(
        MASTER,
        'https://media.dssott.com.attacker.example/title/master.m3u8',
      ),
    ).toBeUndefined();
    expect(
      parseDisneyMasterManifest(`${MASTER}${MASTER.split('\n')[1]}\n`, MASTER_URL)
        ?.resources,
    ).not.toHaveProperty('zh-Hant:normal');
  });

  it.each(['zxx', 'und', 'mul'])(
    'ignores a non-linguistic subtitle catalog tagged %s',
    (language) => {
      expect(
        parseDisneyMasterManifest(
          `#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="Auxiliary",LANGUAGE="${language}",FORCED=NO,URI="r/aux.m3u8"`,
          MASTER_URL,
        ),
      ).toBeUndefined();
    },
  );

  it('expands a complete VOD subtitle playlist with presentation anchors', () => {
    expect(
      parseDisneySubtitlePlaylist(
        `#EXTM3U
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:2.0,
segments/pts_0.vtt
#EXTINF:2.0,
segments/pts_2034699.vtt
#EXT-X-ENDLIST`,
        'https://vod-edge.media.dssott.com/signed/title/r/subtitle.m3u8',
      ),
    ).toEqual([
      {
        url: 'https://vod-edge.media.dssott.com/signed/title/r/segments/pts_0.vtt',
        presentationAnchor: { mpegTs: 0, presentationTimeMs: 0 },
      },
      {
        url:
          'https://vod-edge.media.dssott.com/signed/title/r/segments/pts_2034699.vtt',
        presentationAnchor: {
          mpegTs: 2_034_699,
          presentationTimeMs: 2_000,
        },
      },
    ]);
  });

  it('keeps a whole-program timeline when segment PTS resets', () => {
    expect(
      parseDisneySubtitlePlaylist(
        `#EXTM3U
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:2.0,
segments/pts_90000.vtt
#EXTINF:2.0,
segments/pts_270000.vtt
#EXT-X-DISCONTINUITY
#EXTINF:2.0,
segments/pts_0.vtt
#EXTINF:2.0,
segments/pts_180000.vtt
#EXT-X-ENDLIST`,
        'https://vod-edge.media.dssott.com/signed/title/r/subtitle.m3u8',
      ),
    ).toEqual([
      {
        url:
          'https://vod-edge.media.dssott.com/signed/title/r/segments/pts_90000.vtt',
        presentationAnchor: { mpegTs: 90_000, presentationTimeMs: 1_000 },
      },
      {
        url:
          'https://vod-edge.media.dssott.com/signed/title/r/segments/pts_270000.vtt',
        presentationAnchor: { mpegTs: 270_000, presentationTimeMs: 3_000 },
      },
      {
        url:
          'https://vod-edge.media.dssott.com/signed/title/r/segments/pts_0.vtt',
        presentationAnchor: { mpegTs: 0, presentationTimeMs: 5_000 },
      },
      {
        url:
          'https://vod-edge.media.dssott.com/signed/title/r/segments/pts_180000.vtt',
        presentationAnchor: { mpegTs: 180_000, presentationTimeMs: 7_000 },
      },
    ]);
  });

  it('rejects incomplete playlists and directory escapes', () => {
    expect(
      parseDisneySubtitlePlaylist(
        '#EXTM3U\nsegments/pts_0.vtt',
        'https://vod-edge.media.dssott.com/signed/title/r/subtitle.m3u8',
      ),
    ).toBeUndefined();
    expect(
      parseDisneySubtitlePlaylist(
        '#EXTM3U\n../../pts_0.vtt\n#EXT-X-ENDLIST',
        'https://vod-edge.media.dssott.com/signed/title/r/subtitle.m3u8',
      ),
    ).toBeUndefined();
    expect(
      parseDisneySubtitlePlaylist(
        '#EXTM3U\n#EXTINF:bad,\nsegments/pts_0.vtt\n#EXT-X-ENDLIST',
        'https://vod-edge.media.dssott.com/signed/title/r/subtitle.m3u8',
      ),
    ).toBeUndefined();
  });
});
