# Security

## Reporting a vulnerability

Please report it privately through [GitHub's private vulnerability reporting](https://github.com/feedbakkr/feedbakkr-watch-sdk/security/advisories/new), not in a public issue. We'll reply within a few working days and keep you posted until it's fixed. Please give us a chance to release a fix before you talk about it publicly.

Security fixes go into the latest release.

## What the SDKs send

Only what's described in each package's README. Tags and context are redacted before sending; the SDKs never read cookies, request bodies, form values or auth headers. The browser SDK sends nothing beyond the error itself until the app turns on consent, and sends only over https unless `debug` is on.

## Checks

- **`ci.yml`**: lint, build, types and tests on every pull request.
- **`security-pr.yml`**: `pnpm audit --audit-level high` on every pull request. It blocks the merge.
- **`security-scheduled.yml`**: nightly `pnpm audit --audit-level moderate` and OSV-Scanner. It reports and doesn't block.

Locally: `pnpm run security:scan` (needs `osv-scanner`, e.g. `brew install osv-scanner`).

If an advisory can't be fixed (no patch yet, or it only affects development tools), add its GHSA id to `pnpm.auditConfig.ignoreGhsas` in `package.json` with the reason in the pull request.

## Publishing

`publish-packages.yml` runs by hand once the versions are set. It checks types, tests, audits, builds and packs each package, then publishes with `npm publish --provenance`.

There's no npm token. The workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): GitHub Actions proves who it is to npm with a short-lived OIDC token, and each release gets a public provenance record linking it to the commit and workflow run that built it. Each package has a trusted publisher entry on npmjs.com for `feedbakkr/feedbakkr-watch-sdk` and `publish-packages.yml`.
