import type { SiteId } from '../core/contracts';
import {
  createLanguagePairPreference,
  type LanguagePairPreference,
  type OfficialLanguageOption,
} from '../core/official-pair-selection';

export interface ToggleViewCallbacks {
  readonly onToggle: () => void;
  readonly onOpenLanguagePair: () => void;
  readonly onSelectLanguagePair: (
    preference: LanguagePairPreference,
  ) => void;
  readonly onRetranslate: () => void;
  readonly onOpenSettings: () => void;
}

export interface ToggleView {
  render(
    enabled: boolean,
    status: string,
    catalog: readonly OfficialLanguageOption[],
    preference: LanguagePairPreference,
  ): void;
  reanchor(
    anchor: HTMLElement,
    isFallbackAnchor: boolean,
    before?: HTMLElement,
  ): void;
  destroy(): void;
}

export interface PopoverPlacementInput {
  readonly triggerTop: number;
  readonly triggerBottom: number;
  readonly popoverHeight: number;
  readonly viewportHeight: number;
  readonly gap: number;
}

export type PopoverPlacement = 'above' | 'below';

export function choosePopoverPlacement(
  input: PopoverPlacementInput,
): PopoverPlacement {
  const roomAbove = Math.max(0, input.triggerTop - input.gap);
  const roomBelow = Math.max(
    0,
    input.viewportHeight - input.triggerBottom - input.gap,
  );
  if (roomAbove >= input.popoverHeight) return 'above';
  if (roomBelow >= input.popoverHeight) return 'below';
  return roomBelow >= roomAbove ? 'below' : 'above';
}

export function createToggleView(
  anchor: HTMLElement,
  isFallbackAnchor: boolean,
  siteId: SiteId,
  callbacks: ToggleViewCallbacks,
  before?: HTMLElement,
): ToggleView {
  const host = document.createElement('div');
  host.dataset.duetsubToggle = '';
  host.dataset.site = siteId;
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
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.append(createBar('english'), createBar('chinese'));
  button.append(icon);

  const popover = document.createElement('div');
  popover.id = 'language-menu';
  popover.className = 'popover';
  popover.hidden = true;
  popover.setAttribute('role', 'menu');

  const languageButton = document.createElement('button');
  languageButton.className = 'language-menu-trigger';
  languageButton.type = 'button';
  languageButton.title = '選擇字幕語言';
  languageButton.textContent = '語言';
  languageButton.setAttribute('aria-label', '選擇 DuetSub 字幕語言');
  languageButton.setAttribute('aria-haspopup', 'menu');
  languageButton.setAttribute('aria-controls', popover.id);
  languageButton.setAttribute('aria-expanded', 'false');

  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');

  const chooser = document.createElement('div');
  chooser.className = 'chooser';
  const topSelect = languageSelect('上方字幕');
  const bottomSelect = languageSelect('下方字幕');
  chooser.append(topSelect.label, bottomSelect.label);

  const swap = menuButton('交換上下');
  const retranslate = menuButton('重新翻譯（ticket 04）');
  const settings = menuButton('打開設定');
  popover.append(status, chooser, swap, retranslate, settings);
  shadow.append(style, button, languageButton, popover);
  anchor.insertBefore(host, before ?? null);

  let longPressTimer: number | undefined;
  let suppressClick = false;
  let catalog: readonly OfficialLanguageOption[] = [];
  let chooserSignature = '';

  const showPopover = () => {
    callbacks.onOpenLanguagePair();
    popover.dataset.placement = 'below';
    popover.hidden = false;
    const triggerRect = host.getBoundingClientRect();
    popover.dataset.placement = choosePopoverPlacement({
      triggerTop: triggerRect.top,
      triggerBottom: triggerRect.bottom,
      popoverHeight: popover.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      gap: 8,
    });
    languageButton.setAttribute('aria-expanded', 'true');
  };
  const hidePopover = () => {
    popover.hidden = true;
    languageButton.setAttribute('aria-expanded', 'false');
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
  const selectPair = () => {
    synchronizeDisabledOptions(
      topSelect.select,
      bottomSelect.select,
    );
    const preference = createLanguagePairPreference(
      catalog,
      topSelect.select.value,
      bottomSelect.select.value,
    );
    swap.disabled = preference === undefined;
    if (preference !== undefined) callbacks.onSelectLanguagePair(preference);
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
  const stopNativeControlEvent = (event: Event) => {
    event.stopPropagation();
  };
  languageButton.addEventListener('pointerdown', stopNativeControlEvent);
  languageButton.addEventListener('pointerup', stopNativeControlEvent);
  languageButton.addEventListener('mousedown', stopNativeControlEvent);
  languageButton.addEventListener('mouseup', stopNativeControlEvent);
  languageButton.addEventListener('click', (event) => {
    stopNativeControlEvent(event);
    if (popover.hidden) {
      showPopover();
    } else {
      hidePopover();
    }
  });
  topSelect.select.addEventListener('change', selectPair);
  bottomSelect.select.addEventListener('change', selectPair);
  swap.addEventListener('click', () => {
    const preference = createLanguagePairPreference(
      catalog,
      bottomSelect.select.value,
      topSelect.select.value,
    );
    if (preference !== undefined) callbacks.onSelectLanguagePair(preference);
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
    render(enabled, statusText, nextCatalog, preference) {
      button.classList.toggle('enabled', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      status.textContent = statusText;
      catalog = nextCatalog;
      const signature = JSON.stringify([catalog, preference]);
      if (signature !== chooserSignature) {
        chooserSignature = signature;
        renderLanguageSelect(topSelect.select, catalog, preference.top);
        renderLanguageSelect(bottomSelect.select, catalog, preference.bottom);
        synchronizeDisabledOptions(
          topSelect.select,
          bottomSelect.select,
        );
        swap.disabled = createLanguagePairPreference(
          catalog,
          preference.bottom,
          preference.top,
        ) === undefined;
      }
    },
    reanchor(nextAnchor, nextIsFallbackAnchor, nextBefore) {
      reanchorToggleHost(
        host,
        nextAnchor,
        nextIsFallbackAnchor,
        nextBefore,
      );
    },
    destroy() {
      cancelLongPress();
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      host.remove();
    },
  };
}

export function reanchorToggleHost(
  host: HTMLElement,
  anchor: HTMLElement,
  isFallbackAnchor: boolean,
  before?: HTMLElement,
): void {
  if (
    isFallbackAnchor &&
    !host.hasAttribute('data-fallback-anchor')
  ) {
    return;
  }

  host.toggleAttribute('data-fallback-anchor', isFallbackAnchor);
  const nextSibling = before ?? null;
  if (
    host.parentElement !== anchor ||
    host.nextSibling !== nextSibling
  ) {
    anchor.insertBefore(host, nextSibling);
  }
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

function languageSelect(labelText: string): {
  readonly label: HTMLLabelElement;
  readonly select: HTMLSelectElement;
} {
  const label = document.createElement('label');
  label.className = 'language-field';
  const text = document.createElement('span');
  text.textContent = labelText;
  const select = document.createElement('select');
  select.setAttribute('aria-label', labelText);
  label.append(text, select);
  return { label, select };
}

function renderLanguageSelect(
  select: HTMLSelectElement,
  catalog: readonly OfficialLanguageOption[],
  selected: string,
): void {
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.textContent = catalog.length === 0
    ? '尚未讀取官方字幕'
    : '目前偏好在本節目不可用';
  select.append(placeholder);
  for (const option of catalog) {
    const element = document.createElement('option');
    element.value = option.language;
    element.textContent = `${option.label} · ${option.language}`;
    select.append(element);
  }
  select.value = catalog.some(({ language }) => language === selected)
    ? selected
    : '';
}

function synchronizeDisabledOptions(
  top: HTMLSelectElement,
  bottom: HTMLSelectElement,
): void {
  for (const option of top.options) {
    option.disabled = option.value === '' || option.value === bottom.value;
  }
  for (const option of bottom.options) {
    option.disabled = option.value === '' || option.value === top.value;
  }
}

const TOGGLE_CSS = `
  :host {
    position: relative;
    display: flex;
    align-items: center;
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }

  :host([data-fallback-anchor]) {
    position: absolute;
    right: 1.5%;
    bottom: 2.5%;
  }

  :host([data-site="max"]:not([data-fallback-anchor])) {
    align-self: flex-start;
    height: 48px;
    margin-top: 4px;
  }

  :host([data-site="netflix"]:not([data-fallback-anchor])) {
    order: -1;
  }

  :host([data-site="netflix"]:not([data-fallback-anchor])) .icon {
    transform: translateY(-9px) scale(1.3);
  }

  button {
    font: inherit;
  }

  .toggle {
    display: grid;
    width: 48px;
    height: 48px;
    place-content: center;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
  }

  .language-menu-trigger {
    align-self: center;
    min-width: 42px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid rgb(255 255 255 / 34%);
    border-radius: 6px;
    background: rgb(10 12 16 / 58%);
    color: #f6f8fb;
    cursor: pointer;
    font-size: 12px;
    font-weight: 650;
    line-height: 30px;
  }

  .language-menu-trigger:hover,
  .language-menu-trigger:focus-visible,
  .language-menu-trigger[aria-expanded="true"] {
    border-color: rgb(255 194 75 / 78%);
    background: rgb(24 28 36 / 92%);
    color: #ffc24b;
  }

  .icon {
    box-sizing: border-box;
    display: grid;
    width: 24px;
    height: 24px;
    place-content: center;
    gap: 3px;
    border: 2px solid #f6f8fb;
    border-radius: 5px;
    background: transparent;
  }

  .bar {
    display: block;
    height: 3px;
    border-radius: 999px;
  }

  .bar.english {
    width: 14px;
    background: #f6f8fb;
  }

  .bar.chinese {
    width: 12px;
    justify-self: center;
    background: #f6f8fb;
    opacity: 0.72;
  }

  .toggle.enabled .bar.chinese {
    background: #ffc24b;
    opacity: 1;
  }

  .popover {
    position: absolute;
    right: 0;
    width: max-content;
    min-width: 13rem;
    max-height: calc(100vh - 16px);
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid rgb(255 255 255 / 18%);
    border-radius: 8px;
    background: rgb(24 28 36 / 96%);
    box-shadow: 0 8px 28px rgb(0 0 0 / 45%);
    color: #fff;
  }

  .popover[data-placement="above"] {
    top: auto;
    bottom: calc(100% + 8px);
  }

  .popover[data-placement="below"] {
    top: calc(100% + 8px);
    bottom: auto;
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

  .chooser {
    display: grid;
    gap: 0.62rem;
    padding: 0.7rem 0.78rem;
    border-bottom: 1px solid rgb(255 255 255 / 12%);
  }

  .language-field {
    display: grid;
    gap: 0.28rem;
    color: rgb(255 255 255 / 76%);
    font-size: 0.75rem;
  }

  .language-field select {
    min-width: 16rem;
    padding: 0.38rem 0.46rem;
    border: 1px solid rgb(255 255 255 / 18%);
    border-radius: 4px;
    background: rgb(15 18 24 / 100%);
    color: #fff;
    font: inherit;
  }

  .menu-item:disabled {
    cursor: not-allowed;
    opacity: 0.45;
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
