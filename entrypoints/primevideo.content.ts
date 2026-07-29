import { createPrimeVideoAdapter } from '../src/adapters/primevideo';
import { startDuetSubContent } from '../src/content/controller';
import {
  isDuetSubMessage,
  postDuetSubMessage,
} from '../src/core/messages';

export default defineContentScript({
  matches: ['https://www.primevideo.com/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  registration: 'manifest',
  main() {
    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (
        !isDuetSubMessage(message) ||
        message.direction !== 'main-to-isolated' ||
        message.type !== 'prime-ttml-response'
      ) {
        return;
      }
      postDuetSubMessage(message);
    });
    startDuetSubContent('primevideo', createPrimeVideoAdapter());
  },
});
