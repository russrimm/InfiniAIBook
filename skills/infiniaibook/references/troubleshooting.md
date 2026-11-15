# Troubleshooting

Start with `npm run check:ai`. It exercises the real code paths and prints `PASS`
or `FAIL` with a reason for each model. Add `-- --studio` to generate every text
format, `-- --styles` for every infographic style, or `-- --image` for an image.

| What you see | What to do |
|---|---|
| `'node' is not recognized` or `command not found: node` | Install Node.js 22.13 or later and open a new terminal. |
| `node -v` is below 22.13, or an error mentions `node:sqlite` | Install the current LTS from nodejs.org, then open a new terminal. |
| `npm error enoent ... package.json` | The terminal is not in the project folder. Check that `ls` or `dir` lists `package.json`. |
| "No model provider is configured" | The app did not find the settings. The file must be named exactly `.env.local` (not `.env.local.txt`), sit next to `package.json`, and have no `#` in front of the lines. Restart. |
| `401`, `Incorrect API key`, `Unauthorized` | The key is wrong, has a stray space, or the account has no credit. Copy it again and restart. |
| Azure `404` or `DeploymentNotFound` | `AZURE_OPENAI_DEPLOYMENT` must be the deployment name from Foundry. `AZURE_OPENAI_API_VERSION` must be a dated API release such as `2024-10-21`, not a model version. |
| Azure `401` "principal lacks the data action" | The signed-in account is missing the **Cognitive Services OpenAI User** role on that resource, or `az` is signed in to a different account. Check `az account show`. |
| "Token tenant ... does not match resource tenant" | `az login` is in a different tenant from the resource. Set `AZURE_TENANT_ID` to the resource's tenant, or run `az account set --subscription <id>` for the account that holds the role. |
| The model list says "Azure returned 400 listing deployments" | Same tenant mismatch. Only the model picker is affected. |
| `Port 3000 is in use` | Another copy is running. Use the address the terminal prints, or stop the other one. |
| Notebooks are missing | The app is reading a different `.data` folder. Check `DATA_DIR`, and which copy of the project you started. |
| 403 with `{"code":"host"}` | The `Host` header is not loopback and not in `ALLOWED_HOSTS`. |
| 403 with `{"code":"csrf"}` | A browser sent a state-changing request from another site. Scripts that send no `Origin` are unaffected. |
| 413 `too_large` | The upload is over `MAX_UPLOAD_BYTES` (default 50 MB). Raise it or split the file. |
| Audio, video or voice features say they are not set up | They need an optional service (Azure Speech, an image or transcription model). See `references/setup.md`, then restart. |
| A YouTube source says its transcript could not be retrieved | Set `GEMINI_API_KEY` on the server and retry, or use **Paste** to add a transcript. |
| Whiteboard or motion video fails | Python 3 with `numpy`, `Pillow` and `imageio-ffmpeg` is required. `PYTHON_BIN` selects the interpreter. |
| Answers come back "not cited" | The model answered without marking a passage. Narrow with `sourceIds`, or ask for the specific claim and where it appears. |
| Retrieval seems keyword-only after changing models | Run `POST /api/notebooks/{id}/reembed` for each notebook. |
| `/api/generate` returned 200 but nothing useful | Read the body: a failure after the first five seconds is `{ "error": ... }` inside a 200. |
| The dev server returns 404 for pages after another build | A second server shared the same `.next` folder. Stop both, delete `.next`, and start one. |

## Reporting a bug

Include the failing step, the exact message, `node -v`, the provider name, and
the output of `npm run check:ai` with any keys removed. Report security issues
privately as described in `SECURITY.md`.
