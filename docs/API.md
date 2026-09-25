# InfiniAIBook REST API

Everything the UI does goes through these JSON routes under `/api`, so they can
be scripted too. Requests and responses are JSON unless noted.

## Authentication

When `INFINIAIBOOK_PASSWORD` is unset, the API is open. When it is set, every
route except `/api/auth/*` needs either the session cookie from
`POST /api/auth/login` or the header:

```http
Authorization: Bearer <password>
```

Unauthenticated API calls get `401 {"error": "..."}`.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{ password }` | Sets a 30-day HTTP-only cookie |
| POST | `/api/auth/logout` | — | Clears the cookie |

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

It returns `{ added: [...], errors: [...], warnings: [...] }`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/sources?exclude={notebookId}` | Every source with its notebook's id and title — the Library |
| GET | `/api/sources/{id}` | Full text and metadata |
| POST | `/api/sources/{id}` | `{ action: "apply"\|"dismiss" }` — accept or discard a detected change to a linked source |
| DELETE | `/api/sources/{id}` | |

## Chat and sessions

`POST /api/chat` with `{ notebookId, message, sourceIds?, sessionId? }` streams
newline-delimited JSON events:

| Event | Meaning |
|---|---|
| `{"type":"session","session":{...}}` | Always first; the session used (created if `sessionId` was omitted) |
| `{"type":"citations","citations":[...]}` | Retrieved passages the answer may cite as `[n]` |
| `{"type":"notice", ...}` | Non-fatal note, e.g. keyword fallback |
| `{"type":"delta","v":"..."}` | Next piece of answer text |
| `{"type":"done","id":"...","citations":[...]}` | Saved message id and the citations actually used |
| `{"type":"error","error":"..."}` | Failure |

An unknown `sessionId` returns `404`; no configured model returns
`400 {"code":"no_config"}`.

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
| GET/DELETE | `/api/artifacts/{id}` | A saved artifact |
| GET | `/api/audio/{id}`, `/api/image/{id}`, `/api/voice-preview/{name}` | Binary media |

## Other

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/models` | Read / change the active chat model |
| POST | `/api/discover` | Web search for candidate sources |
| GET | `/api/browse?url=` | Server-side page fetch for the in-app browser |
