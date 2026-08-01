import { startDisneyMainHook } from '../src/main/disney-hook';

export default defineContentScript({
  matches: ['https://www.disneyplus.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    startDisneyMainHook();
  },
});
