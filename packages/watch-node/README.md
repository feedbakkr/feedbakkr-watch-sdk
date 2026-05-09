# @feedbakkr/watch-node

Server SDK for [Feedbakkr Watch](https://github.com/feedbakkr/feedbakkr-tools).
Works in Node, Cloudflare Workers, and any Hono app. Sends asynchronously so
capture never blocks a response.

```bash
pnpm add @feedbakkr/watch-node
```

Hono is an optional peer — only required if you import the `/hono` helper.

## Plain Node

```ts
import { createFeedbakkrErrorsClient } from "@feedbakkr/watch-node";

const errors = createFeedbakkrErrorsClient({
	endpoint: process.env.FBK_ERRORS_ENDPOINT!,
	apiKey: process.env.FBK_ERRORS_KEY,
	projectId: "feedbakkr-api",
	environment: process.env.NODE_ENV ?? "development",
	appVersion: process.env.APP_VERSION,
});

try {
	await doThing();
} catch (e) {
	await errors.captureError(e, { source: "api", route: "/widgets" });
	throw e;
}
```

## Hono / Cloudflare Workers

```ts
import { Hono } from "hono";
import { createFeedbakkrErrorsClient } from "@feedbakkr/watch-node";
import { honoOnError } from "@feedbakkr/watch-node/hono";

const app = new Hono();

app.onError(
	honoOnError({
		client: createFeedbakkrErrorsClient({
			endpoint: env.FBK_ERRORS_ENDPOINT,
			apiKey: env.FBK_ERRORS_KEY,
			projectId: "feedbakkr-api",
			environment: env.ENVIRONMENT,
		}),
	}),
);
```

`honoOnError` reads `c.executionCtx.waitUntil` when available, so on
Workers the capture survives past the response without delaying it.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `endpoint` | — | Worker `/v1/events` URL. |
| `projectId` | — | Stable per-project identifier. |
| `environment` | — | e.g. `production`, `dev`. |
| `apiKey` | — | Sent as `x-feedbakkr-tool-key`. |
| `enabled` | `true` | Set false in tests. |
| `defaultSource` | `"api"` | Override per call if needed. |
| `defaultTags` | — | Tags merged into every event. |
| `maxQueueSize` | `64` | Backpressure cap; excess events drop silently. |
| `beforeSend` | — | Drop or mutate before send. |
| `fetchImpl` | global `fetch` | Inject when bundling for older Node. |

## Privacy by default

Tags and context are sanitised before send — see
[security-and-privacy.md](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/security-and-privacy.md).
The SDK never reads request bodies, cookies, or auth headers on its own.

## Fail-safe

`captureError` never throws into your route handler. The async queue
swallows transport errors so a flapping collector can't take down your API.

## See also

- [Full Node SDK docs](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/node-sdk.md)
