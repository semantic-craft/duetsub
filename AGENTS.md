# duetsub development entry

## Development navigation

- Extension entrypoints: [entrypoints](entrypoints/). Player integrations: [src/adapters](src/adapters/), [src/main](src/main/), [src/content](src/content/).
- Shared subtitle logic: [src/core](src/core/); translation: [src/mt](src/mt/); options: [src/options](src/options/).
- Run `npm test` and `npm run check` from the root; affected regression cases are in [tests](tests/). Packaging and browser acceptance follow [README](README.md), with existing smoke material under [smoke](smoke/).
Read relevant [lessons](lessons.md) before implementation, review, or acceptance; update the matching entry after an observed correction or missed case.
