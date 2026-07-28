export class NativeCaptionVisibility {
  readonly #selector: string;
  readonly #observationTarget: HTMLElement | undefined;
  #hidden = new Map<HTMLElement, string>();
  #observer: MutationObserver | undefined;

  constructor(selector: string, observationTarget?: HTMLElement) {
    this.#selector = selector;
    this.#observationTarget = observationTarget;
  }

  setHidden(hidden: boolean): void {
    if (!hidden) {
      this.restore();
      return;
    }

    this.#synchronize();
    if (
      this.#observer === undefined &&
      this.#observationTarget !== undefined
    ) {
      this.#observer = new MutationObserver(this.#onMutations);
      this.#observer.observe(this.#observationTarget, {
        attributeFilter: ['class', 'style'],
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  }

  restore(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    for (const [element, previousVisibility] of this.#hidden) {
      element.style.visibility = previousVisibility;
    }
    this.#hidden.clear();
  }

  readonly #onMutations: MutationCallback = () => {
    this.#synchronize();
  };

  #synchronize(): void {
    if (this.#observationTarget !== undefined) {
      for (const [element, previousVisibility] of this.#hidden) {
        if (
          this.#observationTarget.contains(element) &&
          element.matches(this.#selector)
        ) {
          continue;
        }
        element.style.visibility = previousVisibility;
        this.#hidden.delete(element);
      }
    }
    const captions = this.#observationTarget?.querySelectorAll<HTMLElement>(
      this.#selector,
    ) ?? document.querySelectorAll<HTMLElement>(this.#selector);
    for (const element of captions) {
      if (!this.#hidden.has(element)) {
        this.#hidden.set(element, element.style.visibility);
      }
      if (element.style.visibility !== 'hidden') {
        element.style.visibility = 'hidden';
      }
    }
  }
}
