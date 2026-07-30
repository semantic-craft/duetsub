import type { OverlayModel } from '../core/overlay-model';

export const OVERLAY_FONT_SIZE = 'clamp(13.76px, 6.2cqh, 40px)';

export interface OverlayView {
  render(model: OverlayModel): void;
  reanchor(player: HTMLElement): void;
  destroy(): void;
}

export function createOverlayView(player: HTMLElement): OverlayView {
  const host = document.createElement('div');
  host.dataset.duetsubOverlay = '';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;

  const board = document.createElement('div');
  board.className = 'board';
  board.setAttribute('role', 'presentation');

  const top = createLine('top');
  const bottom = createLine('bottom');
  board.append(top.element, bottom.element);
  shadow.append(style, board);
  reanchorOverlayHost(host, player);

  return {
    render(model) {
      board.hidden = !model.visible;
      board.style.top = model.placement.edge === 'top' ? model.placement.offset : '';
      board.style.bottom =
        model.placement.edge === 'bottom' ? model.placement.offset : '';

      renderLine(top, model.lines[0]);
      renderLine(bottom, model.lines[1]);
    },
    reanchor(nextPlayer) {
      reanchorOverlayHost(host, nextPlayer);
    },
    destroy() {
      host.remove();
    },
  };
}

export function reanchorOverlayHost(
  host: HTMLElement,
  player: HTMLElement,
): void {
  if (host.parentElement !== player) player.append(host);
}

interface LineElements {
  readonly element: HTMLDivElement;
  readonly marker: HTMLSpanElement;
  readonly text: HTMLSpanElement;
}

function createLine(
  className: 'top' | 'bottom',
): LineElements {
  const element = document.createElement('div');
  element.className = `line ${className}`;

  const marker = document.createElement('span');
  marker.className = 'mt';
  marker.textContent = 'MT';

  const text = document.createElement('span');
  text.className = 'text';
  element.append(marker, text);
  return { element, marker, text };
}

function renderLine(
  elements: LineElements,
  model: OverlayModel['lines'][number],
): void {
  elements.element.hidden = model.text.length === 0;
  elements.element.lang = model.lang;
  elements.element.dir = model.dir;
  elements.element.style.fontSize = `${model.sizePercent}%`;
  elements.marker.hidden = !model.machineTranslated;
  elements.text.textContent = model.text;
}

export const OVERLAY_CSS = `
  :host {
    position: absolute;
    inset: 0;
    z-index: 2147483645;
    display: block;
    overflow: hidden;
    pointer-events: none;
    container-type: size;
  }

  .board {
    position: absolute;
    left: 50%;
    width: fit-content;
    max-width: min(90%, 72rem);
    transform: translateX(-50%);
    box-sizing: border-box;
    padding: 0.34em 0.68em 0.42em;
    border: 1px solid rgb(255 255 255 / 16%);
    border-radius: 0.28em;
    background: rgb(0 0 0 / 70%);
    box-shadow: 0 0.12em 0.4em rgb(0 0 0 / 35%);
    color: #fff;
    font-size: ${OVERLAY_FONT_SIZE};
    font-style: normal;
    font-weight: 400;
    text-align: center;
  }

  .line {
    line-height: 1.28;
    white-space: pre-line;
    unicode-bidi: plaintext;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }

  :lang(ja) {
    font-family: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
  }

  :lang(zh-Hans) {
    font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  }

  :lang(zh-Hant) {
    font-family: "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif;
  }

  :lang(ko) {
    font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
  }

  .top:not([hidden]) + .bottom:not([hidden]) {
    margin-top: 0.10em;
  }

  .mt {
    display: inline-block;
    margin-inline-end: 0.34em;
    padding: 0.08em 0.24em;
    border: 1px solid rgb(255 255 255 / 45%);
    border-radius: 0.2em;
    font-size: 55%;
    line-height: 1;
    vertical-align: 0.14em;
  }

  [hidden] {
    display: none !important;
  }
`;
