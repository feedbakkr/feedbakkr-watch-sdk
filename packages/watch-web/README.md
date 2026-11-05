# @feedbakkr/watch-web

Send browser errors to [FeedBakkr Watch](https://github.com/feedbakkr/feedbakkr-watch). It catches uncaught errors and unhandled promise rejections on its own, and you can report others yourself.

```sh
pnpm add @feedbakkr/watch-web
```

## Start it

Call `initWatch` once, as early as you can in your app's entry, so errors while the page loads are caught too.

```ts
import { initWatch } from "@feedbakkr/watch-web";

initWatch({
	endpoint: "https://feedbakkr-watch.you.workers.dev/v1/events",
	projectId: "my-app",
	environment: "production",
	ingestKey: "wchi_…",
	appVersion: "1.4.0",
});
```

An ingest key can only send errors for its app, so it's safe in browser code. In FeedBakkr you can limit it to your site's address.

## Report an error yourself

```ts
import { addBreadcrumb, captureError, captureMessage } from "@feedbakkr/watch-web";

addBreadcrumb({ category: "ui", message: "Opened checkout" });

try {
	await placeOrder();
} catch (error) {
	captureError(error, { tags: { feature: "checkout" } });
}

captureMessage("Payment provider slow", { severity: "warning" });
```

## React

```tsx
import { WatchErrorBoundary } from "@feedbakkr/watch-web/react";

<WatchErrorBoundary fallback={<p>Something went wrong.</p>}>
	<App />
</WatchErrorBoundary>;
```

`fallback` can also be `(error, reset) => …`. To wrap one component: `withWatchErrorBoundary(Component, { fallback })`. React is only needed if you import `/react`.

## Consent

By default only the error itself is sent: its message and stack, the page's path (without query or hash) and the browser. Two kinds of extra detail are off until you turn them on, for example after a cookie banner:

```ts
import { setConsent } from "@feedbakkr/watch-web";

setConsent({ technical: true, behavioural: true });
```

- `technical`: screen and window size, connection, language, time zone.
- `behavioural`: breadcrumbs, the last click or navigation, and the last few failed requests (address only, no query).

You can also pass `consent` to `initWatch`.

## Options

| Option                       | Default                              |                                                                                     |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `endpoint`                   |                                      | Your Watch's `/v1/events` address. Must be https unless `debug` is on               |
| `projectId`                  |                                      | The app's id in Watch                                                               |
| `environment`                |                                      | e.g. `production`                                                                   |
| `ingestKey`                  |                                      | The app's ingest key                                                                |
| `appVersion`                 |                                      | Shows which release an error came from                                              |
| `enabled`                    | `true`                               | `false` turns everything off. It's also off when `endpoint` or `projectId` is empty |
| `limits`                     | `{ perMinute: 10, repeatMs: 30000 }` | At most this many errors a minute, and the same error at most once in `repeatMs`    |
| `sampleRate`                 | `1`                                  | The share of errors to send, 0 to 1                                                 |
| `defaultSource`              | `web`                                | The component name, e.g. `checkout-web`                                             |
| `defaultTags`                |                                      | Tags added to every error                                                           |
| `url`                        | the page's path                      | The page to report, as a string or a function                                       |
| `groupByUrl`                 | `false`                              | Make the same error on different pages separate issues                              |
| `captureUnhandledErrors`     | `true`                               | Report uncaught errors                                                              |
| `captureUnhandledRejections` | `true`                               | Report unhandled promise rejections                                                 |
| `captureNavigation`          | `false`                              | Add a breadcrumb on each navigation                                                 |
| `maxBreadcrumbs`             | `30`                                 |                                                                                     |
| `timeoutMs`                  | `5000`                               | Give up on a send after this long                                                   |
| `consent`                    | both off                             | See above                                                                           |
| `beforeSend`                 |                                      | `(event) => event \| null`: change an event, or return null to drop it              |
| `debug`                      | `false`                              | Log what the SDK does to the console                                                |

## What it leaves out

- "Script error." reports, which come from other sites' scripts the browser won't show details for.
- Errors from browser extensions.
- Watch's own requests, from the failed-requests list.
- Anything too big to send: large context and breadcrumbs are dropped first, then the stack and message are shortened.

## Safe by design

Nothing the SDK does can throw into your app. If Watch is down or slow, events are dropped quietly. There are no retries.
