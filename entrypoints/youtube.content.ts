import { createYoutubeAdapter } from '../src/adapters/youtube';
import { startDuetSubContent } from '../src/content/controller';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  registration: 'manifest',
  main() {
    startDuetSubContent('youtube', createYoutubeAdapter());
  },
});
