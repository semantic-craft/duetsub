import type { OverlayModel } from '../core/overlay-model';

export const OVERLAY_FONT_SIZE = 'clamp(13.76px, 6.2cqh, 40px)';

export interface OverlayView {
  render(model: OverlayModel): void;
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

  const english = createLine('english', 'en');
  const chinese = createLine('chinese', 'zh-Hant');
  board.append(english.element, chinese.element);
  shadow.append(style, board);
  player.append(host);

  return {
    render(model) {
      board.hidden = !model.visible;
      board.style.top = model.placement.edge === 'top' ? model.placement.offset : '';
      board.style.bottom =
        model.placement.edge === 'bottom' ? model.placement.offset : '';

      renderLine(english, model.lines[0]);
      renderLine(chinese, model.lines[1]);
    },
    destroy() {
      host.remove();
    },
  };
}

interface LineElements {
  readonly element: HTMLDivElement;
  readonly marker: HTMLSpanElement;
  readonly text: HTMLSpanElement;
}

function createLine(
  className: 'english' | 'chinese',
  lang: 'en' | 'zh-Hant',
): LineElements {
  const element = document.createElement('div');
  element.className = `line ${className}`;
  element.lang = lang;

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
  elements.element.style.fontSize = `${model.sizePercent}%`;
  elements.marker.hidden = !model.machineTranslated;
  elements.text.textContent = model.text;
}

const OVERLAY_CSS = `
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
  }

  .english {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }

  .chinese {
    font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  }

  .english:not([hidden]) + .chinese:not([hidden]) {
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
