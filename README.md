# Incremental hydration: click during in-flight hydration is never replayed

Minimal reproduction for an Angular issue. Fresh `ng new repro --ssr` (Angular 22.0.8) with:

- `provideClientHydration(withIncrementalHydration(), withEventReplay())`
- `provideRouter(routes, withEnabledBlockingInitialNavigation())`
- Home page: a 3000px spacer, then `@defer (hydrate on viewport) { <slow-section /> }` holding a `routerLink` anchor.

## Manual steps

```
npm install
npm run build
NG_ALLOWED_HOSTS=localhost PORT=4017 node dist/repro/server/server.mjs
```

1. Open http://localhost:4017/ and throttle the network to Slow 3G.
2. Scroll the link into view (the lazy chunk starts loading).
3. Click "Go to target" while the chunk is still loading.
4. Nothing happens: no navigation, handler never runs, and the anchor's `jsaction` attribute is gone once the chunk arrives.

## Automated probe

```
npm install playwright
npx playwright install chromium
node probe.cjs 5 50,300,800 dom,mouse 1000
```

Runs three scenarios (click before the viewport trigger, click during hydration, click after hydration) with 1000 ms of artificial latency on the lazy chunk and prints a result table.
