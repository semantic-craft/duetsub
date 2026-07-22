import { startFakeMainStub } from '../src/main/fake-source';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'manifest',
  main() {
    startFakeMainStub('youtube');
  },
});
