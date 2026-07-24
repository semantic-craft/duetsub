import { createNetflixAdapter } from '../src/adapters/netflix';
import { isNetflixWatchUrl } from '../src/adapters/netflix-location';
import { startDuetSubContent } from '../src/content/controller';

export default defineContentScript({
  matches: ['https://www.netflix.com/watch/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  registration: 'manifest',
  main() {
    if (!isNetflixWatchUrl(window.location.href)) return;
    startDuetSubContent('netflix', createNetflixAdapter());
  },
});
