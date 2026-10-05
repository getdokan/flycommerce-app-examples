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
3. Give the PR a title in the [commit message format](#commit-messages).
4. CI must be green.

## Commit messages

Commit messages and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <summary>
```

| Type | For |
|---|---|
| `feat` | something new people can use |
| `fix` | a bug fix |
| `perf` | faster or smaller, same behaviour |
| `refactor` | a code change that doesn't change behaviour |
| `docs` | documentation only |
| `test` | tests only |
| `build` | the build, dependencies or release configuration |
| `ci` | GitHub Actions |
| `chore` | anything else, such as a release |

- The scope is optional: the example's folder, such as `order-review`.
- Write the summary in the imperative, in lower case, with no full stop: `fix(order-review): skip orders that are already on hold`.
- A breaking change adds `!` after the type or scope and says in the body what to change.

PRs are squash-merged, and a check fails the PR until its title follows the format. Keep the commits in the format too: a PR with one commit is squashed under that commit's message.

By taking part you agree to follow the [code of conduct](https://github.com/getdokan/flycommerce-app-examples/blob/main/CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](https://github.com/getdokan/flycommerce-app-examples/blob/main/SECURITY.md), never a public issue.
