# Security

`feedbakkr-watch-sdk` follows the [Feedbakkr org dependency-scanning
policy][org-policy]. This is a publicly-published package monorepo — source
visibility lets npm verify provenance attestations on every release.

[org-policy]: https://github.com/feedbakkr/feedbakkr/blob/main/docs/security-dependency-scanning.md

## Workflows

- **`ci.yml`** — lint + build + typecheck + test on every PR against `main`.
- **`security-pr.yml`** — runs `pnpm audit --audit-level high` on every PR.
  **Blocking.** Fails the PR if a high+ advisory is present.
- **`security-scheduled.yml`** — nightly (04:00 UTC) + `workflow_dispatch`.
  Runs `pnpm audit --audit-level moderate` plus OSV-Scanner. Reporting-only;
  uploads the JSON OSV report as a 30-day artifact.
- **`publish-packages.yml`** — manual dispatch. Bumps versions in each
  publishable package's `package.json` are checked in beforehand. The
  workflow runs the full pre-publish gate (typecheck → test → audit → build
  → per-package `npm pack --dry-run`) then publishes all 5 packages with
  `npm publish --provenance`.

## Publishing auth — OIDC trusted publishing

There is **no `NPM_TOKEN` secret** on this repo. Publishes use the
[npm trusted publisher][trusted] flow: GitHub Actions mints an OIDC token,
npm exchanges it for a short-lived publish token, the publish runs, and a
provenance attestation gets signed and recorded in the public sigstore
transparency log.

[trusted]: https://docs.npmjs.com/trusted-publishers

Requirements maintained by this workflow:

- Job `permissions: id-token: write`
- Node 24 on the runner (ships npm 11.x, which has the OIDC client)
- No `registry-url` on `actions/setup-node` (it would write an `.npmrc`
  forcing token auth before OIDC kicks in)
- `--provenance` on every `npm publish`
- Public repo (npm rejects provenance attestations from private sources)

For each published package, the matching Trusted Publisher entry must exist
on npmjs.com pointing at `feedbakkr/feedbakkr-watch-sdk` +
`publish-packages.yml`.

## Local scans

```bash
pnpm run security:audit            # high+ — mirrors the PR gate
pnpm run security:audit:moderate   # moderate+ — mirrors the scheduled scan
pnpm run security:scan             # audit + osv-scanner
pnpm run security:scan:full        # audit:moderate + osv-scanner
```

Install osv-scanner locally (macOS): `brew install osv-scanner`.

## Adding an exception

If a high+ advisory genuinely can't be fixed (no upstream patch / dev-only /
not exploitable in our usage), follow the org exception process documented
in the [org policy][org-policy]. Add the GHSA to
`pnpm.auditConfig.ignoreGhsas` in root `package.json` and document the
reasoning in `docs/security-exceptions.md`.
