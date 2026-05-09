# @feedbakkr/watch-types

Shared TypeScript types describing the contract every Feedbakkr tool worker
implements. Used by the Feedbakkr dashboard, by the per-tool UI packages, and
by the workers themselves.

```bash
pnpm add @feedbakkr/watch-types
```

## What's exported

- `ToolManifest` — the shape served at `/.well-known/feedbakkr-tool.json`.
- `ToolConnection` — a Feedbakkr-side record linking a project to a tool.
- `ToolHealthResponse` — the shape `/health` returns.
- `ToolReportResponse<T>` — list-shaped response envelope with filters,
  sorts, actions, pagination, and display hints.
- `ToolFilterMeta`, `ToolSortMeta`, `ToolPagination`, `ToolDisplayMeta` —
  metadata pieces the report envelope carries.
- `ToolActionDescriptor`, `ToolNotificationEvent`, `ToolConfigSchema` —
  manifest sub-shapes.
- `ToolApiError` — the error envelope every tool returns.

## Example: serving a manifest

```ts
import type { ToolManifest } from "@feedbakkr/watch-types";

export const manifest: ToolManifest = {
	toolId: "feedbakkr-uptime",
	name: "Feedbakkr Uptime",
	version: "0.1.0",
	capabilities: ["list", "detail"],
	supportedSources: ["http", "tcp"],
	reports: [
		{
			id: "checks",
			name: "Checks",
			uiComponent: "UptimeChecksPage",
			supportedFilters: ["status", "region"],
			supportedSorts: ["lastCheck", "uptime"],
		},
	],
	actions: [],
	notificationEvents: [
		{ id: "check_failed", name: "Check failed", defaultEnabled: true },
	],
};
```

## Versioning

Semver. A breaking change to any of the exported shapes is a major bump.
The dashboard checks the contract version in your worker's manifest at
connection time and refuses to wire up a worker built against an
incompatible major.

## See also

- [feedbakkr-tools repo](https://github.com/feedbakkr/feedbakkr-tools)
- [Tool contract docs](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/watch-types.md)
