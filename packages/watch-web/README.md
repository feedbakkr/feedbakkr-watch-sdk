# @feedbakkr/watch-web

Browser SDK for [Feedbakkr Watch](https://github.com/feedbakkr/feedbakkr-tools).
Captures uncaught errors, unhandled rejections, and explicit captures, then
forwards them to your self-hosted (or managed) collector.

```bash
pnpm add @feedbakkr/watch-web
```

## Initialise

Call once at the top of your app entry — ideally before any other client
code runs, so errors during boot are caught.

```ts
import { initFeedbakkrErrors } from "@feedbakkr/watch-web";

initFeedbakkrErrors({
	endpoint: "https://errors.example.com/v1/events",
	projectId: "feedbakkr-web",
	environment: "production",
	appVersion: "1.0.0",
	apiKey: import.meta.env.VITE_FBK_ERRORS_KEY,
});
```

## Capture explicitly

```ts
import { addBreadcrumb, captureError, captureMessage } from "@feedbakkr/watch-web";

addBreadcrumb({ category: "ui", message: "Opened inbox" });

try {
	await doRiskyThing();
} catch (e) {
	captureError(e, {
		tags: { feature: "inbox" },
		context: { workspaceId, projectId },
	});
}
```

## React error boundary

Available behind a subpath import so the bundle stays free of React if you
don't need it:

```tsx
import { FeedbakkrErrorBoundary } from "@feedbakkr/watch-web/react";

<FeedbakkrErrorBoundary fallback={<ErrorScreen />}>
	<App />
</FeedbakkrErrorBoundary>;
```

Or use the HOC: `withErrorBoundary(Component, { fallback })`.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `endpoint` | — | Worker `/v1/events` URL. |
| `projectId` | — | Stable identifier per project. |
| `environment` | — | `production`, `staging`, etc. |
| `appVersion` | — | Recommended; correlates errors to releases. |
| `apiKey` | — | Sent as `x-feedbakkr-tool-key`. |
| `enabled` | `true` | Set false in tests. |
| `debug` | `false` | Logs internal failures via `console.debug`. |
| `maxBreadcrumbs` | `30` | Cap on retained breadcrumbs. |
| `sampleRate` | `1` | 0–1 fraction sent. |
| `captureUnhandledErrors` | `true` | `window.error` listener. |
| `captureUnhandledRejections` | `true` | `window.unhandledrejection` listener. |
| `captureNavigation` | `false` | Auto-breadcrumb on history changes. |
| `beforeSend` | — | `(event) => event \| null` filter/mutate. |

## Privacy by default

The SDK never reads cookies, request bodies, form values, or auth headers.
Tags and context are sanitised — keys matching `authorization`, `cookie`,
`password`, `token`, `api_key`, `email`, `session*`, etc. are replaced
with `[REDACTED]` before send.

Full list and sanitisation rules:
[security-and-privacy.md](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/security-and-privacy.md).

## Fail-safe

Capture never throws into your app. Network failures, malformed responses,
and `beforeSend` exceptions are all swallowed (and logged via `debug` when
enabled).

## See also

- [Full web SDK docs](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/web-sdk.md)
