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
  it('offers official subtitle restore separately from AI bottom retranslation', () => {
    expect(toggleViewSource).toContain(
      "menuButton('重新載入官方字幕')",
    );
    expect(toggleViewSource).toContain(
      "menuButton('用 AI 重譯下方字幕')",
    );
    expect(toggleViewSource).not.toContain('ticket 04');
    expect(toggleViewSource).toContain(
      'callbacks.onReloadOfficialTracks()',
    );
    expect(toggleViewSource).toContain(
      'callbacks.onAiRetranslateBottom()',
    );
    expect(controllerSource).toContain(
      "type: 'reload-tracks'",
    );
    expect(controllerSource).toContain(
      'this.#adapter.start()',
    );
    expect(controllerSource).toContain(
      'this.#bottomRetranslationPlan',
    );
    expect(controllerSource).toContain(
      'this.#acquireTopForBottomRetranslation(',
    );
    expect(controllerSource).toContain(
      'this.#rememberOfficialPair()',
    );
    expect(controllerSource).toContain(
      'this.#restoreOfficialPairSnapshot()',
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

  it('renders the acquired site languages without overwriting the saved preference', () => {
    expect(controllerSource).toContain(
      'top: this.#topLanguage',
    );
    expect(controllerSource).toContain(
      'bottom: this.#bottomLanguage',
    );
    expect(controllerSource).toContain(
      'top: cues.top.language',
    );
    expect(controllerSource).toContain(
      'bottom: cues.bottom.language',
    );
  });
});
