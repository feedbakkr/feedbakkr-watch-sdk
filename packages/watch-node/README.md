# @feedbakkr/watch-node

Send server errors to [FeedBakkr Watch](https://github.com/feedbakkr/feedbakkr-watch) from Node, Cloudflare Workers or any Hono app. Sending never delays a response.

```sh
pnpm add @feedbakkr/watch-node
```

## Node

```ts
import { createWatchClient } from "@feedbakkr/watch-node";

const watch = createWatchClient({
	endpoint: process.env.WATCH_ENDPOINT,
	projectId: "my-api",
	environment: process.env.NODE_ENV ?? "development",
	ingestKey: process.env.WATCH_INGEST_KEY,
});

try {
	await doThing();
} catch (error) {
	void watch.captureError(error, { route: "/orders" });
	throw error;
}

// Before a short-lived script exits:
await watch.flush();
```

## Hono and Cloudflare Workers

On Workers your settings arrive on `env` with each request. `getWatchClient` makes one client for the same settings and reuses it, so its limits work across requests.

```ts
import { Hono } from "hono";
import { getWatchClient } from "@feedbakkr/watch-node";
import { watchOnError } from "@feedbakkr/watch-node/hono";

const app = new Hono<{ Bindings: Env }>();

app.onError(
	watchOnError({
		client: (c) =>
			getWatchClient({
				endpoint: c.env.WATCH_ENDPOINT,
				projectId: "my-api",
				environment: c.env.ENVIRONMENT,
				ingestKey: c.env.WATCH_INGEST_KEY,
			}),
	}),
);
```

`watchOnError`:

- reports unexpected errors and answers with a JSON 500;
- leaves an `HTTPException` its own response, and reports it only if its status is 500 or more, so a 404 you throw on purpose isn't an error;
- records the route pattern (`/orders/:id`), method, status and the `x-request-id` header;
- passes the send to `executionCtx.waitUntil`, so it finishes after the response.

Outside Hono on Workers, do the same yourself: `ctx.waitUntil(watch.captureError(error))`. Don't `await` it in the request.

## Options

| Option          | Default                             |                                                                                            |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `endpoint`      |                                     | Your Watch's `/v1/events` address                                                          |
| `projectId`     |                                     | The app's id in Watch                                                                      |
| `environment`   |                                     | e.g. `production`                                                                          |
| `ingestKey`     |                                     | The app's ingest key                                                                       |
| `appVersion`    |                                     | Shows which release an error came from                                                     |
| `enabled`       | `true`                              | `false` turns it off, e.g. in tests. It's also off when `endpoint` or `projectId` is empty |
| `limits`        | `{ perMinute: 60, repeatMs: 2000 }` | At most this many errors a minute, and the same error at most once in `repeatMs`           |
| `defaultSource` | `api`                               | The component name, e.g. `api-cron`                                                        |
| `defaultTags`   |                                     | Tags added to every error                                                                  |
| `groupByUrl`    | `false`                             | Make the same error on different routes separate issues                                    |
| `maxQueueSize`  | `64`                                | Errors waiting to send beyond this are dropped                                             |
| `timeoutMs`     | `5000`                              | Give up on a send after this long                                                          |
| `beforeSend`    |                                     | `(event) => event \| null`: change an event, or return null to drop it                     |
| `fetchImpl`     | `fetch`                             | Use a different `fetch`                                                                    |
| `debug`         | `false`                             | Log failed sends to the console                                                            |

## Safe by design

`captureError` never throws, and its promise never rejects: it settles once the event is sent, refused or timed out. If Watch is down, events are dropped quietly; there are no retries. Tags and context are redacted before sending, and the SDK never reads request bodies, cookies or headers other than the request id.
