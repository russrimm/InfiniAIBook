# InfiniAIBook REST API

Everything the UI does goes through these JSON routes under `/api`, so they can
be scripted too. Requests and responses are JSON unless noted.

## Authentication

When `INFINIAIBOOK_PASSWORD` is unset, the API needs no credentials. When it is
set, every route except `/api/auth/*` needs either the session cookie from
`POST /api/auth/login` or a bearer token:

```http
Authorization: Bearer <INFINIAIBOOK_API_TOKEN>
```

Until `INFINIAIBOOK_API_TOKEN` is set, the password is accepted in its place
(deprecated; the server logs a warning). Once it is set, only the token works.

Unauthenticated API calls get `401 {"error": "..."}`.

Two checks apply whether or not a password is set:

- Requests whose `Host` is not a loopback name or listed in `ALLOWED_HOSTS` get
  `403 {"code": "host"}`. This check always runs without a password, and runs
  with one only when `ALLOWED_HOSTS` is set.
- A POST, PATCH or DELETE a browser sends from another site (a cross-site
  `Sec-Fetch-Site`, or a foreign `Origin`) gets `403 {"code": "csrf"}`. Scripts
  that send neither header are unaffected.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{ password }` | Sets a signed 30-day HTTP-only cookie. Attempts are serialised; each failure delays the next one longer (up to 30 s) |
| POST | `/api/auth/logout` | — | Clears the cookie |
| GET | `/api/auth/status` | — | `{ auth }`: whether a password is required |

## Notebooks

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/notebooks` | — | All notebooks with counts |
| POST | `/api/notebooks` | `{ title }` | The new notebook |
| GET | `/api/notebooks/{id}` | — | Notebook, `sources`, `artifacts` (summaries), `sessions`, `notes`, and `messages` of the latest session |
| PATCH | `/api/notebooks/{id}` | `{ title }` | Rename |
| DELETE | `/api/notebooks/{id}` | — | Deletes it and everything in it |
| POST/GET | `/api/notebooks/{id}/check-sources` | — | Re-check linked sources for changes |
| POST/GET | `/api/notebooks/{id}/reembed` | — | Re-embed chunks after changing embedding model |

## Sources

`POST /api/notebooks/{id}/sources` accepts one of:

- `multipart/form-data` with one or more `files` (documents, images, audio,
  video — media is transcribed, up to 25 MB);
- `{ url, title? }` — web page, YouTube link, RSS/Atom feed, or direct media link;
- `{ text, title?, kind?: "note" }` — pasted text (`kind: "note"` marks a note
  turned into a source);
- `{ copyFrom: "<sourceId>" }` — copy a source from another notebook, with its
  chunks and embeddings.

It returns `{ added: [...], errors: [...], warnings: [...] }`. A request body
larger than `MAX_UPLOAD_BYTES` (default 50 MB) gets
`413 {"code": "too_large"}` before it is read, and a larger file inside a
multipart upload is reported in `errors`. Each source's summary is generated
just after the response, so it appears on the next `GET /api/notebooks/{id}`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/sources?exclude={notebookId}` | Every source with its notebook's id and title — the Library |
| GET | `/api/sources/{id}` | Full text and metadata. `?part=n` also returns `passage`, the text of that cited part |
| POST | `/api/sources/{id}` | `{ action: "apply"\|"dismiss" }` — accept or discard a detected change to a linked source |
| DELETE | `/api/sources/{id}` | |

## Chat and sessions

**`sourceIds`**, here and on the Studio routes below, limits grounding to those
sources. If you omit it, every source in the notebook is used. An empty list
`[]` is refused with `400 {"code": "no_sources"}` rather than treated as "all".

`POST /api/chat` with `{ notebookId, message, sourceIds?, sessionId? }` streams
newline-delimited JSON events:

| Event | Meaning |
|---|---|
| `{"type":"session","session":{...}}` | Always first; the session used (created if `sessionId` was omitted) |
| `{"type":"citations","citations":[...]}` | Retrieved passages the answer may cite as `[n]` |
| `{"type":"notice", ...}` | Non-fatal note, e.g. keyword fallback |
| `{"type":"delta","v":"..."}` | Next piece of answer text |
| `{"type":"done","id":"...","citations":[...],"stopped":false}` | Saved message id and the citations actually used |
| `{"type":"error","error":"..."}` | Failure |

An unknown `sessionId` returns `404`; no configured model returns
`400 {"code":"no_config"}`; a `message` over 20,000 characters returns
`400 {"code":"too_long"}`.

Closing the connection mid-answer (the UI's **Stop** button) aborts the model
request. The text received so far is saved as the answer, ending with
"_(Stopped before the answer was finished.)_".

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/notebooks/{id}/sessions` | — | Sessions, newest first |
| POST | `/api/notebooks/{id}/sessions` | `{ title? }` | New session |
| GET | `/api/sessions/{id}` | — | Session with `messages` |
| PATCH | `/api/sessions/{id}` | `{ title }` | Rename |
| DELETE | `/api/sessions/{id}` | — | Deletes its messages too |

## Notes

| Method | Path | Body |
|---|---|---|
| GET | `/api/notebooks/{id}/notes` | — |
| POST | `/api/notebooks/{id}/notes` | `{ content, title?, kind?: "human"\|"ai", sourceId?, citations? }` |
| GET | `/api/notes/{id}` | — |
| PATCH | `/api/notes/{id}` | `{ title?, content? }` |
| DELETE | `/api/notes/{id}` | — |

To make a note searchable by chat, post its content as a source with
`kind: "note"`.

## Transformations

Built-in transformations have ids beginning `builtin:` (URL-encode the colon)
and cannot be edited or deleted.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/transformations` | — | Built-in and custom |
| POST | `/api/transformations` | `{ name, prompt, description? }` | New custom transformation |
| GET/PATCH/DELETE | `/api/transformations/{id}` | `{ name?, prompt?, description? }` | |
| POST | `/api/transformations/apply` | `{ transformationId, sourceId }` | `201` with the resulting note |

## Search

| Method | Path | Notes |
|---|---|---|
| GET | `/api/search?q=...&mode=text\|vector&notebookId=` | Passage `hits` (with notebook id/title) and matching `notes`; omit `notebookId` to search everything |
| POST | `/api/search/ask` | `{ question, notebookId? }` → grounded `answer` with `citations`; not saved to any session |

## Studio

| Method | Path | Body |
|---|---|---|
| POST | `/api/generate` | `{ notebookId, type, topic?, sourceIds?, style?, difficulty?, length? }` |
| POST | `/api/podcast` | `{ notebookId, topic?, sourceIds?, preset?, speakers?: [{ voice?, name?, role? }] (1–4), rate?, breath?, length? }` |
| POST | `/api/video` | Whiteboard video; poll `GET /api/video/{id}` |
| POST | `/api/training` | `{ notebookId, topic?, sourceIds?, presenter?, voice?, background?, length? }` → training transcript artifact |
| PATCH | `/api/training/{id}` | Edit `title`, `description`, `objectives`, `sections`, `presenter`, `voice`, `background`; 409 while rendering |
| POST | `/api/training/{id}/render` | Start the avatar render; poll `GET /api/artifacts/{id}` for `progress.stage` |
| GET/DELETE | `/api/artifacts/{id}` | A saved artifact |
| GET | `/api/audio/{id}`, `/api/image/{id}`, `/api/voice-preview/{name}` | Binary media |

## Other

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/models` | Read / change the active chat model |
| POST | `/api/discover` | Web search for candidate sources |
| GET | `/api/browse?url=` | Server-side page fetch for the in-app browser |
