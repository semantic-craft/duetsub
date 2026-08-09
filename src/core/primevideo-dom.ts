export const PRIME_PLAYER_SELECTOR =
  'div[id^="dv-web-player"].dv-player-fullscreen';
export const PRIME_VIDEO_SELECTOR = `${PRIME_PLAYER_SELECTOR} video`;
export const PRIME_CAPTIONS_TOGGLE_BUTTON_SELECTOR =
  '#atvwebplayersdk-captions-toggle-button';
export const PRIME_SETTINGS_BUTTON_SELECTOR =
  '#atvwebplayersdk-settings-button';
export const PRIME_SUBTITLES_BUTTON_SELECTOR =
  '#atvwebplayersdk-subtitles-button';
export const PRIME_SUBTITLE_RADIO_SELECTOR =
  `${PRIME_PLAYER_SELECTOR} input[type="radio"][name="subtitle"]`;

export function readPrimeSubtitleTrackId(
  radio: HTMLInputElement,
): string {
  return radio.value.trim();
}

export function readPrimeSubtitleTrackLabel(
  radio: HTMLInputElement,
): string {
  const label = radio.closest('label');
  return (label?.innerText || label?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}
