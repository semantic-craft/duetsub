import { createMaxAdapter } from '../src/adapters/max';
import { startDuetSubContent } from '../src/content/controller';

export default defineContentScript({
  matches: ['https://play.hbomax.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  registration: 'manifest',
  main() {
    startDuetSubContent('max', createMaxAdapter());
  },
});
