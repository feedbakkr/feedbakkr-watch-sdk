# @feedbakkr/watch-core

The parts shared by [`@feedbakkr/watch-web`](../watch-web), [`@feedbakkr/watch-node`](../watch-node) and [FeedBakkr Watch](https://github.com/feedbakkr/feedbakkr-watch) itself. You don't usually install it: use the SDK for your runtime.

- `buildPayload(error, config, options)` builds the event that's sent to `POST /v1/events`.
- `sanitise(value)` redacts keys that look sensitive and caps depth, size and string length.
- `normaliseMessage`, `normaliseRoute` and `topMeaningfulFrame` remove ids, query strings and build hashes, so the same error groups the same way across releases.
- `computeFingerprint(event)` gives the grouping key. An event's own `fingerprint` is used if it has one; otherwise it's built from the app, environment, component, error name, normalised message, top stack frame and, with `groupByUrl`, the route.
- `fitPayload(event)` shrinks an event to fit the size limit, dropping the least useful parts first.
- `Throttle` limits events per minute and drops quick repeats.
- `AsyncQueue` sends events one at a time without blocking the app.

The types (`EventPayload`, `CaptureOptions`, `Breadcrumb` and the rest) are exported too.

Nothing here throws into the app that uses it, and there are no dependencies: only Web Crypto and standard JavaScript, so it runs in browsers, Node and Workers.
