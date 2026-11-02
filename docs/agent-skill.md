# Agent skill

InfiniAIBook ships an [Agent Skill](https://agentskills.io/specification) that
teaches a coding agent how to install, configure, run and script it. Install it
once and an agent such as GitHub Copilot, Claude Code, Codex or Cursor can set
the app up, connect it to a model, add sources, ask cited questions and generate
Studio output through the [REST API](API.md), without you pasting instructions
each time.

The skill lives in [`skills/infiniaibook/`](../skills/infiniaibook/SKILL.md).

## Install it

```bash
npx skills add russrimm/InfiniAIBook --skill infiniaibook
```

The [`skills` CLI](https://github.com/vercel-labs/skills) detects the agents on
your machine and asks where to put it. It needs Node.js 22.20 or later. Useful
options:

| Option | Effect |
|---|---|
| `-a claude-code` | Install for one named agent, without the prompt |
| `-g` | Install for every project instead of the current one |
| `npx skills add russrimm/InfiniAIBook --list` | Show what is in the repository without installing |
| `npx skills update` | Pull the latest version |
| `npx skills remove infiniaibook` | Remove it |

The [supported agents page](https://github.com/vercel-labs/skills/blob/main/docs/agents.md)
lists each agent's skills folder. To install by hand, copy the
`skills/infiniaibook` folder into that folder. The skill is plain Markdown, with
no scripts and nothing that runs on its own.

## What it covers

| File | Contents |
|---|---|
| [`SKILL.md`](../skills/infiniaibook/SKILL.md) | When to use it, install and run, connecting a model, the API workflow and the guardrails |
| [`references/setup.md`](../skills/infiniaibook/references/setup.md) | Every provider, the Azure and Entra settings, Docker, password protection and data location |
| [`references/api.md`](../skills/infiniaibook/references/api.md) | Curl and JavaScript examples for notebooks, sources, chat with citations, Studio, audio and video |
| [`references/troubleshooting.md`](../skills/infiniaibook/references/troubleshooting.md) | Symptoms and fixes, starting with `npm run check:ai` |

An agent reads the short `SKILL.md` first and opens a reference file only when
the task needs it.

## What to ask for

- "Set up InfiniAIBook on this machine and connect it to my Azure OpenAI resource."
- "Create a notebook from these three URLs and summarize the main risks, with citations."
- "Generate a study guide and a quiz from the Riverside notebook."
- "Why does InfiniAIBook say no model provider is configured?"

## What the skill makes the agent do

- Keep keys in `.env.local`, which git ignores, and never print or commit them.
- Leave the server on `127.0.0.1`, and set `INFINIAIBOOK_PASSWORD` before any
  network exposure.
- Check the response body for `error` on slow routes, because a long request can
  fail inside a `200` (see [Slow requests](API.md#studio)).
- Confirm before bulk generation, since every call spends your model quota.
- Back up a notebook with an export before anything that deletes data.

## Maintaining the skill

Edit the files under `skills/infiniaibook/`. `npm test` runs
[`tests/skill.test.ts`](../tests/skill.test.ts), which checks that the frontmatter
follows the specification (`name` matches the folder, `description` is at most
1,024 characters), that the Node.js version matches `package.json`, that every
`/api/...` path the skill mentions has a route in `src/app/api`, and that it
names every Studio type. The rest of `skills/` is git-ignored agent tooling; the
exception for `skills/infiniaibook/` is in [`.gitignore`](../.gitignore).
