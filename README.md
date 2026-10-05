# FlyCommerce app examples

Complete, working example apps for [FlyCommerce](https://flycommerce.com). Each one shows how a real app puts the platform together: installing on a store, showing pages inside the merchant's dashboard, calling the store API, and receiving webhooks.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/getdokan/flycommerce-app-examples/blob/main/LICENSE)

> **Preview.** The examples arrive with the first release of the FlyCommerce app SDK on npm. Until then this repository holds the layout and the rules every example follows.

## Examples

| Example | What it shows | Status |
| --- | --- | --- |
| [`order-review`](order-review) | Hold big orders until you've checked them: install, session tokens, pages built with `@flycommerce/ui`, calling the store as the user and as the app, webhooks, an hourly catch-up job and uninstall handling. Comes with a step-by-step tutorial. Start here. | Preview: installs once the SDK is on npm |

Each example is a folder you can copy out and run on its own.

## Built with

- [`@flycommerce/app-bridge`, `@flycommerce/app-server`, `@flycommerce/app-emulator`](https://github.com/getdokan/flycommerce-sdk): the app SDK
- [`@flycommerce/ui`](https://ui.flycommerce.com): components that look like the dashboard
- The [Building apps](https://developers.flycommerce.com/docs/apps) guide and the [API reference](https://developers.flycommerce.com/docs)

Build with Claude Code: `/plugin marketplace add getdokan/flycommerce-sdk`, then `/plugin install flycommerce-apps@flycommerce`.

## How an example is laid out

```
<example>/
  src/
    server.ts        Node backend: every route in one table
    *.ts             install, session, webhooks, jobs, data: one concept per file
    pages/           React pages shown inside the merchant's dashboard
  test/              tests against @flycommerce/app-emulator
  app-config.json    the app's dashboard pages, released from the developer portal
  .env.example       every environment variable, explained
  README.md          what it shows, how to run it, what to read next
  AGENTS.md          the same, for coding agents
  package.json
```

Every example:

- runs locally against `@flycommerce/app-emulator`, with no FlyCommerce account needed;
- has tests that run in CI;
- keeps secrets in environment variables, never in the code;
- uses only public packages and documented APIs.

## Contributing and security

- [CONTRIBUTING.md](https://github.com/getdokan/flycommerce-app-examples/blob/main/CONTRIBUTING.md): how to add or change an example.
- [SECURITY.md](https://github.com/getdokan/flycommerce-app-examples/blob/main/SECURITY.md): how to report a vulnerability. Please don't open a public issue for one.
- [CODE_OF_CONDUCT.md](https://github.com/getdokan/flycommerce-app-examples/blob/main/CODE_OF_CONDUCT.md)

## License

[MIT](https://github.com/getdokan/flycommerce-app-examples/blob/main/LICENSE)
