import { startMaxMainHook } from '../src/main/max-hook';

export default defineContentScript({
  matches: ['https://play.hbomax.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    startMaxMainHook();
  },
});
