interface HiddenCaption {
  readonly element: HTMLElement;
  readonly previousVisibility: string;
}

export class NativeCaptionVisibility {
  readonly #selector: string;
  #hidden: HiddenCaption[] = [];

  constructor(selector: string) {
    this.#selector = selector;
  }

  setHidden(hidden: boolean): void {
    if (!hidden) {
      this.restore();
      return;
    }

    for (const element of document.querySelectorAll<HTMLElement>(this.#selector)) {
      if (this.#hidden.some((entry) => entry.element === element)) continue;
      this.#hidden.push({
        element,
        previousVisibility: element.style.visibility,
      });
      element.style.visibility = 'hidden';
    }
  }

  restore(): void {
    for (const { element, previousVisibility } of this.#hidden) {
      element.style.visibility = previousVisibility;
    }
    this.#hidden = [];
  }
}
