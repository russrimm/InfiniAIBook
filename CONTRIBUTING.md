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
npm run test:coverage   # unit tests with a v8 coverage report in coverage/ and CI-enforced floors
npm run test:e2e        # browser tests (Playwright; run `npx playwright install chromium` once)
npm run build           # production build
npm run check:ssrf      # URL-fetch safety tests (no network or credentials needed)
npm run check:motion    # synthetic motion render (needs Python: numpy, pillow, imageio-ffmpeg)
npm run check:training  # synthetic training video compose (same Python packages)
npm run check:ai        # live provider checks; add --studio, --styles or --image as relevant
```

`check:ai` calls the configured model provider and costs tokens; run it when you
change prompts, schemas or `src/lib/ai.ts`. Everything else except `check:ai`
also runs in CI (`.github/workflows/ci.yml`) on every pull request, along with
a Docker build and boot test, a dependency audit and CodeQL. The coverage thresholds in `vitest.config.mts` sit just under the
current numbers; raise them when you add tests, and don't lower them. Unit tests
live in `tests/` and use a temporary `DATA_DIR`, never your real `.data/`.
Browser tests live in `e2e/`. They start their own dev server on port 3123 with
a temporary `DATA_DIR`, and use a local mock model, so they need no credentials.
`e2e/axe.spec.ts` scans the main screens and dialogs with axe-core (WCAG 2.2 A and
AA plus best practices, including color contrast, landmarks and heading order) in
the dark and light themes at 1280 px and 390 px wide. It must report zero
violations: fix the markup instead of disabling a rule, and add a step for any new
screen or dialog.

New pull requests start from a [template](.github/pull_request_template.md)
with these checks and the guidelines below as a checklist.

## Dependency audit

CI fails when `npm audit --omit=dev` reports a **high or critical** advisory in a
production dependency (`scripts/audit-gate.ts`, tested in
`tests/auditgate.test.ts`). The usual fix is to update the package, or to add an
`overrides` entry when the vulnerable copy is a transitive one. If the advisory
cannot apply here or no fix exists yet, record a reviewed exception in
[`.github/audit-allowlist.json`](.github/audit-allowlist.json):

```json
{
  "exceptions": [
    {
      "id": "GHSA-xxxx-xxxx-xxxx",
      "reason": "Why it does not apply, or what is blocking the fix (at least 20 characters).",
      "expires": "2027-01-31"
    }
  ]
}
```

An exception must name the GitHub advisory, give a reason, and expire within 90
days, so it is looked at again; after that date the advisory fails the build
again. A check run prints which exceptions are in use, which have expired and
which match nothing and can be deleted. If npm's registry cannot be reached or is
rate limiting, the gate reports a warning and passes instead of blocking every
merge; a failure to run the audit for any other reason (no lockfile, output the
script cannot read) fails the job. To run it yourself: `npx tsx scripts/audit-gate.ts`.

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
