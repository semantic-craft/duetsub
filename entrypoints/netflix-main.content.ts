import { startNetflixMainHook } from '../src/main/netflix-hook';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    startNetflixMainHook();
  },
});
