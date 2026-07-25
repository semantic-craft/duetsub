# Chrome Web Store listing draft

## Product name

DuetSub

## Summary

English and Traditional Chinese subtitles together on supported streaming players.

## Detailed description

DuetSub adds a compact control to supported video players and displays English above Traditional Chinese in a synchronized overlay.

When both official tracks are available, DuetSub uses them directly. When one language is missing, users may optionally configure DeepSeek, another OpenAI-compatible HTTPS service, or a local Ollama/LM Studio endpoint to translate the missing line. Simplified Chinese can be converted to Traditional Chinese locally.

Supported sites:

- Netflix
- Prime Video
- Max at play.hbomax.com
- YouTube

DuetSub restores the native subtitle layer when disabled or when it cannot verify subtitle ownership. It does not download video, bypass DRM, unlock region-restricted tracks, inject remote code, or collect analytics.

## Single purpose

Display synchronized English and Traditional Chinese subtitles together on supported video players, using official tracks whenever available and an optional user-configured translation endpoint only for a missing language.

## Permission justifications

### storage

Stores the per-site on/off preference, optional translation settings, API key, and local translation cache inside the browser profile.

### Netflix, Prime Video, Max, and YouTube host access

Required to insert the DuetSub player control, observe subtitle responses already available to the signed-in user, synchronize cues to the current video, and render or restore the subtitle layers.

### Optional HTTPS host access

Allows a user to authorize the exact HTTPS translation host configured in settings. No HTTPS translation host is granted at install time; Chrome prompts only after the user clicks Save or Test.

### Optional loopback host access

Allows a user to authorize a local OpenAI-compatible service on `localhost`, `127.0.0.1`, or `[::1]`. No loopback origin is granted at install time.

## Remote code

DuetSub does not execute remotely hosted code. Translation services return subtitle text data only.

## Privacy policy

https://github.com/semantic-craft/duetsub/blob/main/PRIVACY.md

## Category

Productivity

## Language

English (primary); Traditional Chinese user interface text is included in the extension.
