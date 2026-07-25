import { describe, expect, it } from 'vitest';

import { reanchorToggleHost } from '../src/content/toggle-view';

describe('toggle view anchoring', () => {
  it('moves from the fallback anchor into native controls and stays there while controls hide', () => {
    let fallback = true;
    let parent: HTMLElement | null = {} as HTMLElement;
    let next: ChildNode | null = null;
    const host = {
      get parentElement() {
        return parent;
      },
      get nextSibling() {
        return next;
      },
      hasAttribute(name: string) {
        return name === 'data-fallback-anchor' && fallback;
      },
      toggleAttribute(name: string, force: boolean) {
        if (name === 'data-fallback-anchor') fallback = force;
      },
    } as unknown as HTMLElement;
    const fullscreen = {} as HTMLElement;
    const nativeControls = {
      insertBefore(node: HTMLElement, before: HTMLElement | null) {
        expect(node).toBe(host);
        parent = nativeControls as unknown as HTMLElement;
        next = before;
      },
    } as unknown as HTMLElement;
    const fallbackAnchor = {
      insertBefore() {
        parent = fallbackAnchor as unknown as HTMLElement;
        next = null;
      },
    } as unknown as HTMLElement;

    reanchorToggleHost(host, nativeControls, false, fullscreen);

    expect(fallback).toBe(false);
    expect(parent).toBe(nativeControls);
    expect(next).toBe(fullscreen);

    reanchorToggleHost(host, fallbackAnchor, true);

    expect(fallback).toBe(false);
    expect(parent).toBe(nativeControls);
    expect(next).toBe(fullscreen);
  });
});
