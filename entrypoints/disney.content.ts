import { createDisneyAdapter } from '../src/adapters/disney';
import { startDuetSubContent } from '../src/content/controller';

export default defineContentScript({
  matches: ['https://www.disneyplus.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  registration: 'manifest',
  main() {
    startDuetSubContent('disneyplus', createDisneyAdapter());
  },
});
