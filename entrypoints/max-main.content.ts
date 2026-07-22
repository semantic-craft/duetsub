import { startFakeMainStub } from '../src/main/fake-source';

export default defineContentScript({
  matches: ['https://play.hbomax.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    startFakeMainStub('max');
  },
});
