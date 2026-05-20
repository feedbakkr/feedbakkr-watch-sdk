# feedbakkr-watch-sdk

Browser + server SDKs for [Feedbakkr Watch](https://www.feedbakkr.com) — a
self-hostable error monitoring tool for Cloudflare Workers + D1.

The Cloudflare worker that ingests events lives in the (private)
[`feedbakkr-watch`](https://github.com/feedbakkr/feedbakkr-watch) repo; this
repo contains only the publicly-published npm packages so that npm provenance
attestations can be verified against open source.

## Packages

| Package | Purpose |
|---|---|
| [`@feedbakkr/watch-core`](packages/watch-core) | Shared primitives consumed by every other package |
| [`@feedbakkr/watch-node`](packages/watch-node) | Server SDK (Node, Cloudflare Workers, Hono) for capturing errors |
| [`@feedbakkr/watch-types`](packages/watch-types) | TypeScript types for the Feedbakkr Watch tool contract |
| [`@feedbakkr/watch-ui`](packages/watch-ui) | React components for browsing and acting on captured errors |
| [`@feedbakkr/watch-web`](packages/watch-web) | Browser SDK for capturing errors and forwarding them to a Feedbakkr Watch collector |

## Install

```bash
# Browser
pnpm add @feedbakkr/watch-web

# Server (Node, Cloudflare Workers, Hono)
pnpm add @feedbakkr/watch-node
```

Each package has its own README with usage examples.

## Local development

```bash
pnpm install
pnpm verify          # lint + build + typecheck + test
```

`pnpm build` rebuilds every package; `pnpm test` runs all package tests.

## Publishing

Releases go out via the `Publish packages` workflow on push to `main` (with a
version bump) or manual dispatch. All publishes use **OIDC trusted publishing**
— there's no `NPM_TOKEN` secret. Provenance attestations tie each tarball
back to the GitHub Actions run that produced it.

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full dependency-scanning
and publish-gate policy.

## License

[MIT](LICENSE)
