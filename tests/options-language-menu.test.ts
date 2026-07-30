import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const optionsHtml = readFileSync(
  new URL('../entrypoints/options.html', import.meta.url),
  'utf8',
);

describe('options official language menus', () => {
  it('uses real select menus instead of value-filtered datalists', () => {
    expect(optionsHtml).toContain('<select id="official-language-top">');
    expect(optionsHtml).toContain('<select id="official-language-bottom">');
    expect(optionsHtml).not.toContain('list="official-language-options"');
  });
});
