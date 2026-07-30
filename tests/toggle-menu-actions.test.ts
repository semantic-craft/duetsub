import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const toggleViewSource = readFileSync(
  new URL('../src/content/toggle-view.ts', import.meta.url),
  'utf8',
);
const controllerSource = readFileSync(
  new URL('../src/content/controller.ts', import.meta.url),
  'utf8',
);

describe('player language menu actions', () => {
  it('offers a dedicated official subtitle reload separate from MT retry', () => {
    expect(toggleViewSource).toContain(
      "menuButton('重新載入官方字幕')",
    );
    expect(toggleViewSource).toContain("menuButton('重新翻譯')");
    expect(toggleViewSource).not.toContain('ticket 04');
    expect(toggleViewSource).toContain(
      'callbacks.onReloadOfficialTracks()',
    );
    expect(controllerSource).toContain(
      "type: 'reload-tracks'",
    );
    expect(controllerSource).toContain(
      'this.#adapter.start()',
    );
  });

  it('reconnects player-owned views during controller reconciliation', () => {
    expect(controllerSource).toContain(
      'this.#overlayView.reanchor(target.player)',
    );
    expect(controllerSource).toContain(
      'this.#toggleView.reanchor(',
    );
  });
});
