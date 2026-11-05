# Changelog

## 1.0.0

The first public release, for FeedBakkr Watch 1.0.

### Changed

- New names: `initWatch` (was `initFeedbakkrErrors`), `createWatchClient` (was `createFeedbakkrErrorsClient`), `watchOnError` (was `honoOnError`), `WatchErrorBoundary` and `withWatchErrorBoundary`.
- `apiKey` is now `ingestKey`. `tenantId` and `projectName` are gone.
- An event's own `fingerprint` is hashed in full, so long fingerprints that start the same no longer group together.
- `watchOnError` keeps an `HTTPException`'s own response and reports only 5xx errors. It records the route pattern rather than the path.

### Added

- Limits on what each page or process sends (`limits`): web 10 a minute and the same error once every 30 seconds; server 60 a minute and once every 2 seconds.
- Events too big to send are shrunk to fit.
- `getWatchClient`, which reuses one client for the same settings (for Workers).
- `watchOnError` accepts a function that returns the client for a request.
- The web SDK ignores "Script error." and errors from browser extensions, and leaves Watch's own requests out of the failed-requests list.

### Removed

- `ensureRequestId`, which couldn't work on Workers.
- `@feedbakkr/watch-types` and `@feedbakkr/watch-ui`, which nothing used.
- `safeJsonStringify` and `severityForCapture` from `watch-core`.
