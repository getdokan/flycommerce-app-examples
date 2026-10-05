# Contributing

Thanks for helping. These examples are what developers copy, so each one must be correct, current and safe to copy.

## What makes a good example

- **It shows one real app, end to end.** Install, pages, store calls, webhooks: only as much as the app needs.
- **It uses the published SDK and documented APIs only.** No private endpoints and no copies of SDK code.
- **It runs locally** against `@flycommerce/app-emulator`, and its tests pass in CI.
- **It explains itself.** A README says what the example shows, how to run it and what to read next; `.env.example` explains every variable.
- **It's safe to copy.** No secrets, real app IDs or store addresses in the code. Every token check, signature check and store filter the [Building apps](https://developers.flycommerce.com/docs/apps) guide asks for is in place.

## Pull requests

1. Open an issue first for a new example, so we can agree it's worth adding.
2. Keep a pull request to one example.
3. CI must be green.

By taking part you agree to follow the [code of conduct](https://github.com/getdokan/flycommerce-app-examples/blob/main/CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](https://github.com/getdokan/flycommerce-app-examples/blob/main/SECURITY.md), never a public issue.
