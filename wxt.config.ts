import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'DuetSub',
    description: 'Personal bilingual subtitle overlay for supported video sites.',
    version: '0.1.0',
    permissions: ['storage'],
    host_permissions: [
      'https://www.netflix.com/*',
      'https://www.primevideo.com/*',
      'https://play.hbomax.com/*',
      'https://www.youtube.com/*',
      'https://api.deepseek.com/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      'http://[::1]/*',
    ],
    optional_host_permissions: ['https://*/*'],
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
});
