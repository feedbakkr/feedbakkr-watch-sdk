# FeedBakkr Watch SDKs

Send your app's errors to [FeedBakkr Watch](https://github.com/feedbakkr/feedbakkr-watch): free error tracking that runs on your own Cloudflare account.

| Package                                         | For                                                     |
| ----------------------------------------------- | ------------------------------------------------------- |
| [`@feedbakkr/watch-web`](packages/watch-web)    | Browsers, with an optional React error boundary         |
| [`@feedbakkr/watch-node`](packages/watch-node)  | Node and Cloudflare Workers, with an optional Hono hook |
| [`@feedbakkr/watch-core`](packages/watch-core)  | The event format and privacy rules both SDKs share      |

```sh
pnpm add @feedbakkr/watch-web    # browser
pnpm add @feedbakkr/watch-node   # server
```

FeedBakkr's Watch page gives you the code for your app, with your endpoint, app id and ingest key filled in. Each package's README has the details.

## What every SDK does

- **Never breaks your app.** Capturing never throws, and a slow or broken Watch never delays a page or a response.
- **Keeps your data private.** Keys that look sensitive (`password`, `token`, `authorization`, `cookie`, `email` and similar) are redacted before sending. The SDKs never read cookies, request bodies or form values.
- **Stays within your limits.** Repeats of the same error are dropped for a short while, and each page or process sends a limited number a minute, so one error in a loop can't use up the app's daily allowance.
- **Stays small.** `@feedbakkr/watch-web` is about 4.5 KB gzipped, and depends only on `@feedbakkr/watch-core`.

## Develop

Needs Node 22 and pnpm.

```sh
pnpm install
pnpm verify   # lint, build, types and tests
```

## Releases

Versions follow [semver](https://semver.org); changes are in [CHANGELOG.md](CHANGELOG.md). Packages are published from GitHub Actions with npm trusted publishing, so each one has a provenance record linking it to the commit it was built from. See [docs/SECURITY.md](docs/SECURITY.md).

## Licence

[MIT](LICENSE)
