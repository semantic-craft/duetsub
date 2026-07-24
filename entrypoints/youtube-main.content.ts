import { startYoutubeMainHook } from '../src/main/youtube-hook';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    startYoutubeMainHook();
  },
});
