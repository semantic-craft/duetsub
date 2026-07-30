import { defineConfig } from 'wxt';

const STABLE_EXTENSION_PUBLIC_SPKI =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7hEVXczM1ZeAosF9tWlBUdDhgI+qDrBQZb/xoC03lV3R1ECi9WEH3bdaT/uKwqb4GTF5eFxs05K9acVHl1Lxz/QDJlJy9se965JqLn4q963JDvvgAxAE7XT8CemDgz7CfR5KGYz+VzJybCTrRJHNSV3FGQ94mxJzX3pW2KFU65Q6iVKOVqstqSC90LtCZ3sdmK+T1UxH8xENirtlZoo+sLn/duQn8UEfU/E2PqMLY2lNjq73UpQo6SWanbk1hLZv7ENwOtVw/M1oJbZVE78MgUWrT49AAVGWU/ozkMyfob4byT1N7tEfGmoTx1mRIMhqftHybZlVySQNeeFw9LEFDwIDAQAB';

export default defineConfig({
  manifest: ({ mode }) => ({
    name: 'DuetSub',
    description: 'Personal bilingual subtitle overlay for supported video sites.',
    version: '0.1.6',
    ...(mode === 'store' ? {} : { key: STABLE_EXTENSION_PUBLIC_SPKI }),
    permissions: ['storage', 'webRequest'],
    host_permissions: [
      'https://www.netflix.com/*',
      'https://www.primevideo.com/*',
      'https://*.amazon.pv-cdn.net/*',
      'https://play.hbomax.com/*',
      'https://www.youtube.com/*',
    ],
    optional_host_permissions: [
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      'http://[::1]/*',
    ],
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  }),
});
