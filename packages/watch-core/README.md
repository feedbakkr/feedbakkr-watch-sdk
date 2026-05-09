# @feedbakkr/watch-core

Shared error-monitoring primitives used by `watch-web`, `watch-node`, and
the `watch-worker`. You don't usually install this directly — pick the SDK
that matches your runtime.

```bash
pnpm add @feedbakkr/watch-core
```

## What's in the box

- **Payload builder** — `buildPayload(error, config, options)` produces the
  JSON wire format every collector consumes.
- **Sanitisation** — `sanitise(value)` recursively walks objects and redacts
  keys matching a deny-list (`authorization`, `cookie`, `password`,
  `api_key`, `email`, …) plus depth/key/string caps.
- **Normalisation** — `normaliseMessage`, `normaliseRoute`,
  `topMeaningfulFrame`. Strips dynamic IDs, query strings, and bundle
  hashes so the same logical error fingerprints consistently across builds.
- **Fingerprinting** — `computeFingerprint(payload)` returns a 16-char hex
  hash. Explicit fingerprint on the payload wins; otherwise computed from
  `(projectId, env, source, errorName, normalisedMessage, topFrame, normalisedRoute)`.
- **Async queue** — `AsyncQueue` is a tiny bounded ordered queue used by
  the SDKs to batch sends without ever blocking the host.

## Types

`EventPayload`, `Breadcrumb`, `CaptureOptions`, `ErrorSeverity`,
`ErrorSource`, `RuntimeContext`, `RequestContext`, `UserContext`,
`IngestResponse`, `Tags`.

## Example

```ts
import { buildPayload, computeFingerprint, sanitise } from "@feedbakkr/watch-core";

const payload = buildPayload(new Error("boom"), {
	projectId: "demo",
	environment: "production",
	defaultSource: "api",
});
payload.tags = sanitise({ feature: "checkout", apiKey: "shouldnt-leak" });
const fp = await computeFingerprint(payload);
```

The `apiKey` in that tags object will be replaced with `[REDACTED]` before
the payload leaves the process.

## Design rules

- The package never throws into host code paths. Sanitiser and fingerprinter
  return safe defaults if their inputs are unusable.
- No runtime dependencies — uses only Web Crypto + standard JS.
- Same shape consumed by every runtime: browser, Node, Cloudflare Workers.

## See also

- [Web SDK docs](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/web-sdk.md)
- [Node SDK docs](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/node-sdk.md)
- [Security & privacy](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/security-and-privacy.md)
