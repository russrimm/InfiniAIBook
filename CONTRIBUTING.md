# Contributing

Issues and pull requests are welcome. For anything larger than a small fix,
open an issue first so the approach can be agreed before you invest time in it.

## Development setup

Requirements: Node.js 22.13 or later (the database uses the built-in
`node:sqlite`), and a model provider — Azure OpenAI or any OpenAI-compatible
endpoint. Python is only needed for whiteboard videos.

```bash
npm install
cp .env.example .env.local   # configure a provider; see docs/configuration.md
npm run dev
```

## Before opening a pull request

Run the checks that cover your change:

```bash
npx tsc --noEmit        # type check
npm run lint            # ESLint
npm test                # unit tests (vitest; no network or credentials needed)
npm run test:e2e        # browser tests (Playwright; run `npx playwright install chromium` once)
npm run build           # production build
npm run check:ssrf      # URL-fetch safety tests (no network or credentials needed)
npm run check:ai        # live provider checks; add --studio, --styles or --image as relevant
```

`check:ai` calls the configured model provider and costs tokens; run it when you
change prompts, schemas or `src/lib/ai.ts`. Everything else except `check:ai`
also runs in CI (`.github/workflows/ci.yml`) on every pull request. Unit tests
live in `tests/` and use a temporary `DATA_DIR`, never your real `.data/`.
Browser tests live in `e2e/`. They start their own dev server on port 3123 with
a temporary `DATA_DIR`, and use a local mock model, so they need no credentials.

New pull requests start from a [template](.github/pull_request_template.md)
with these checks and the guidelines below as a checklist.

## Guidelines

- Keep the grounding rule intact: generated content must come from the selected
  sources, with citations, never from the model's own knowledge.
- Keep changes focused, and update `README.md`, the relevant page in `docs/` and
  `.env.example` when you add a feature, setting or environment variable.
- Never commit `.env*` files (other than `.env.example`), `.data/`, API keys,
  cookies or real user documents. Screenshots should use fictional sample data.
- `package-lock.json` must resolve every package from `https://registry.npmjs.org/`
  (CI checks this). If you install through a private mirror, set
  `replace-registry-host=npmjs` in your `.npmrc` so its host is not written
  into the lockfile.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- By contributing you agree that your contributions are licensed under the
  [MIT License](LICENSE).
