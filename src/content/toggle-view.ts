export interface ToggleViewCallbacks {
  readonly onToggle: () => void;
  readonly onRetranslate: () => void;
  readonly onOpenSettings: () => void;
}

export interface ToggleView {
  render(enabled: boolean, status: string): void;
  destroy(): void;
}

export function createToggleView(
  anchor: HTMLElement,
  isFallbackAnchor: boolean,
  callbacks: ToggleViewCallbacks,
  before?: HTMLElement,
): ToggleView {
  const host = document.createElement('div');
  host.dataset.duetsubToggle = '';
  if (isFallbackAnchor) host.dataset.fallbackAnchor = '';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TOGGLE_CSS;

  const button = document.createElement('button');
  button.className = 'toggle';
  button.type = 'button';
  button.title = 'DuetSub';
  button.setAttribute('aria-label', '切換 DuetSub 雙字幕');
  button.setAttribute('aria-haspopup', 'menu');
  button.append(createBar('english'), createBar('chinese'));

  const popover = document.createElement('div');
  popover.className = 'popover';
  popover.hidden = true;
  popover.setAttribute('role', 'menu');

  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');

  const retranslate = menuButton('重新翻譯（ticket 04）');
  const settings = menuButton('打開設定');
  popover.append(status, retranslate, settings);
  shadow.append(style, button, popover);
  anchor.insertBefore(host, before ?? null);

  let longPressTimer: number | undefined;
  let suppressClick = false;

  const showPopover = () => {
    popover.hidden = false;
  };
  const hidePopover = () => {
    popover.hidden = true;
  };
  const cancelLongPress = () => {
    if (longPressTimer !== undefined) window.clearTimeout(longPressTimer);
    longPressTimer = undefined;
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    cancelLongPress();
    longPressTimer = window.setTimeout(() => {
      suppressClick = true;
      showPopover();
    }, 550);
  };
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && !host.contains(event.target)) hidePopover();
  };

  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('pointerup', cancelLongPress);
  button.addEventListener('pointercancel', cancelLongPress);
  button.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    callbacks.onToggle();
  });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showPopover();
  });
  retranslate.addEventListener('click', () => {
    callbacks.onRetranslate();
    hidePopover();
  });
  settings.addEventListener('click', () => {
    callbacks.onOpenSettings();
    hidePopover();
  });
  document.addEventListener('pointerdown', onDocumentPointerDown);

  return {
    render(enabled, statusText) {
      button.classList.toggle('enabled', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      status.textContent = statusText;
    },
    destroy() {
      cancelLongPress();
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      host.remove();
    },
  };
}

function createBar(className: 'english' | 'chinese'): HTMLSpanElement {
  const bar = document.createElement('span');
  bar.className = `bar ${className}`;
  return bar;
}

function menuButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'menu-item';
  button.type = 'button';
  button.setAttribute('role', 'menuitem');
  button.textContent = label;
  return button;
}

const TOGGLE_CSS = `
  :host {
    position: relative;
    z-index: 2147483647;
    display: inline-flex;
    margin-inline: 0.35rem;
    vertical-align: middle;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }

  :host([data-fallback-anchor]) {
    position: absolute;
    right: 1.5%;
    bottom: 2.5%;
  }

  button {
    font: inherit;
  }

  .toggle {
    display: grid;
    width: 36px;
    height: 28px;
    place-content: center;
    gap: 3px;
    padding: 5px 7px;
    border: 1px solid rgb(255 255 255 / 30%);
    border-radius: 6px;
    background: rgb(24 28 36 / 82%);
    cursor: pointer;
  }

  .toggle.enabled {
    border-color: #ffc24b;
    box-shadow: 0 0 0 1px rgb(255 194 75 / 30%);
  }

  .bar {
    display: block;
    height: 3px;
    border-radius: 999px;
  }

  .bar.english {
    width: 20px;
    background: #f6f8fb;
  }

  .bar.chinese {
    width: 14px;
    justify-self: center;
    background: #ffc24b;
  }

  .popover {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    width: max-content;
    min-width: 13rem;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 18%);
    border-radius: 8px;
    background: rgb(24 28 36 / 96%);
    box-shadow: 0 8px 28px rgb(0 0 0 / 45%);
    color: #fff;
  }

  .status,
  .menu-item {
    box-sizing: border-box;
    width: 100%;
    padding: 0.62rem 0.78rem;
    color: inherit;
    text-align: left;
  }

  .status {
    border-bottom: 1px solid rgb(255 255 255 / 12%);
    color: rgb(255 255 255 / 76%);
    font-size: 0.78rem;
  }

  .menu-item {
    display: block;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: 0.86rem;
  }

  .menu-item:hover,
  .menu-item:focus-visible {
    background: rgb(255 255 255 / 10%);
  }

  [hidden] {
    display: none !important;
  }
`;
