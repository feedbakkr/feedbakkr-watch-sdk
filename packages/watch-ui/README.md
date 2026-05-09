# @feedbakkr/watch-ui

React components for browsing and acting on errors collected by a
[Feedbakkr Watch worker](https://github.com/feedbakkr/feedbakkr-tools).
Designed to be embedded inside the Feedbakkr dashboard, but usable in any
React app that injects an `apiClient`.

```bash
pnpm add @feedbakkr/watch-ui
```

React 18 or 19 is a peer dependency. Tailwind CSS is assumed in the host app
(class names are inline). If you need scoped styles, fork or wrap.

## What it exports

**Pages**

- `<ErrorGroupsPage projectId connectionId apiClient onSelectGroup? />` —
  list view with filters, sort, and click-through.
- `<ErrorGroupDetailPage groupId apiClient onBack? />` — detail view with
  occurrence history and resolve / ignore / reopen actions.
- `<ErrorOverviewCards projectId? environment? apiClient />` — three-card
  summary for a dashboard tile.

**Primitives**

- `<ErrorSeverityBadge severity />`
- `<ErrorStatusBadge status />`
- `<ErrorStackTrace stack />`
- `<ErrorOccurrenceList occurrences onSelect? />`
- `<ErrorGroupRow group onSelect? />`
- `<ErrorFilters value onChange />`

**API client**

- `ToolApiClient` — interface every page consumes. The dashboard injects
  its own implementation that proxies through a BFF, so the worker key
  never reaches the browser.
- `createBrowserApiClient({ baseUrl, getKey })` — reference impl that calls
  the worker directly. Useful for local dev / standalone use.

## Wiring

```tsx
import { ErrorGroupsPage, createBrowserApiClient } from "@feedbakkr/watch-ui";

const apiClient = createBrowserApiClient({
	baseUrl: connection.apiBaseUrl,
	getKey: () => Promise.resolve(connection.apiKey),
});

<ErrorGroupsPage
	projectId={project.id}
	connectionId={connection.id}
	apiClient={apiClient}
	onSelectGroup={(group) => router.push(`/errors/${group.id}`)}
/>;
```

For production use inside Feedbakkr, build your own `apiClient` that hits
your dashboard's BFF and let the BFF attach the tool key server-side.

## Boundaries

The UI package does **not** own:

- routing
- Feedbakkr auth or session
- the dashboard's app shell or layout
- project selection or global navigation

Feedbakkr — or whatever host renders these components — owns all of that.

## See also

- [Feedbakkr integration docs](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/feedbakkr-integration.md)
- [Tool contract](https://github.com/feedbakkr/feedbakkr-tools/blob/main/docs/watch-types.md)
