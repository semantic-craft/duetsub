import { startDuetSubContent } from '../src/content/controller';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  registration: 'manifest',
  main() {
    startDuetSubContent('netflix');
  },
});
