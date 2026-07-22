import { startPrimeVideoMainHook } from '../src/main/primevideo-hook';

export default defineContentScript({
  matches: ['https://www.primevideo.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    startPrimeVideoMainHook();
  },
});
