import { createPrimeVideoAdapter } from '../src/adapters/primevideo';
import { startDuetSubContent } from '../src/content/controller';

export default defineContentScript({
  matches: ['https://www.primevideo.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  registration: 'manifest',
  main() {
    startDuetSubContent('primevideo', createPrimeVideoAdapter());
  },
});
