export class NativeCaptionVisibility {
  static readonly VIDEO_CUE_ATTRIBUTE =
    'data-duetsub-native-video-cues-hidden';

  readonly #selector: string;
  readonly #observationTarget: HTMLElement | undefined;
  #cueVideos: readonly HTMLVideoElement[];
  #videoCueAttributesWerePresent = new Map<HTMLVideoElement, boolean>();
  #hidden = new Map<HTMLElement, string>();
  #observer: MutationObserver | undefined;

  constructor(
    selector: string,
    observationTarget?: HTMLElement,
    cueVideo?: HTMLVideoElement | readonly HTMLVideoElement[],
  ) {
    this.#selector = selector;
    this.#observationTarget = observationTarget;
    this.#cueVideos = cueVideo === undefined
      ? []
      : Array.isArray(cueVideo) ? cueVideo : [cueVideo];
    this.#recordCueAttributes();
  }

  setCueVideos(videos: readonly HTMLVideoElement[]): void {
    if (
      this.#cueVideos.length === videos.length &&
      this.#cueVideos.every((video, index) => video === videos[index])
    ) {
      return;
    }
    this.restore();
    this.#cueVideos = [...videos];
    this.#recordCueAttributes();
  }

  setHidden(hidden: boolean): void {
    if (!hidden) {
      this.restore();
      return;
    }

    this.#synchronize();
    if (this.#cueVideos.length > 0) {
      ensureNativeCueStyle();
      for (const video of this.#cueVideos) {
        video.setAttribute(NativeCaptionVisibility.VIDEO_CUE_ATTRIBUTE, '');
      }
    }
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
    for (const video of this.#cueVideos) {
      if (!this.#videoCueAttributesWerePresent.get(video)) {
        video.removeAttribute(NativeCaptionVisibility.VIDEO_CUE_ATTRIBUTE);
      }
    }
    for (const [element, previousVisibility] of this.#hidden) {
      element.style.visibility = previousVisibility;
    }
    this.#hidden.clear();
  }

  #recordCueAttributes(): void {
    this.#videoCueAttributesWerePresent = new Map(
      this.#cueVideos.map((video) => [
        video,
        video.hasAttribute(NativeCaptionVisibility.VIDEO_CUE_ATTRIBUTE),
      ]),
    );
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

function ensureNativeCueStyle(): void {
  const id = 'duetsub-native-video-cue-style';
  if (document.getElementById(id) !== null) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `video[${NativeCaptionVisibility.VIDEO_CUE_ATTRIBUTE}]::cue {
    color: transparent !important;
    background-color: transparent !important;
    text-shadow: none !important;
  }`;
  (document.head ?? document.documentElement).append(style);
}
