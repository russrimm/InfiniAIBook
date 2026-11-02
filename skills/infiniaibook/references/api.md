# API reference

A task-oriented subset of `docs/API.md` (the complete route list). All bodies are
JSON unless noted. Examples assume:

```bash
B=http://localhost:3000
H='content-type: application/json'
# With INFINIAIBOOK_PASSWORD set, add: -H "Authorization: Bearer $INFINIAIBOOK_API_TOKEN"
```

## Check the server

```bash
curl -s $B/api/auth/status        # { "auth": false } or { "auth": true }
curl -s $B/api/budget             # { enabled, capCents, spentCents, remainingCents }
curl -s $B/api/models             # active chat, embedding, image and vision models
```

Unauthenticated calls to a password-protected instance get
`401 {"error":"..."}`. A request whose `Host` is not loopback or in
`ALLOWED_HOSTS` gets `403 {"code":"host"}`. A cross-site browser POST, PATCH or
DELETE gets `403 {"code":"csrf"}`; scripts that send no `Origin` are unaffected.

## Notebooks

```bash
curl -s -X POST $B/api/notebooks -H "$H" -d '{"title":"Riverside research"}'
curl -s $B/api/notebooks                      # all notebooks with counts
curl -s $B/api/notebooks/{id}                 # sources, artifacts, sessions, notes, messages
curl -s $B/api/notebooks/{id}/export -o notebook.zip
curl -s -X DELETE $B/api/notebooks/{id}       # deletes everything in it
```

## Add sources

```bash
# a web page, YouTube link, RSS feed or direct media link
curl -s -X POST $B/api/notebooks/{id}/sources -H "$H" -d '{"url":"https://example.com/article"}'

# pasted text
curl -s -X POST $B/api/notebooks/{id}/sources -H "$H" -d '{"title":"Meeting notes","text":"..."}'

# files (documents, images, audio, video up to 25 MB, PowerPoint, ZIP)
curl -s -X POST $B/api/notebooks/{id}/sources -F "files=@report.pdf" -F "files=@deck.pptx"
```

The response is `{ added: [...], errors: [...], warnings: [...] }`. Always read
`errors`: a source can fail on its own while the request succeeds. A request body
over `MAX_UPLOAD_BYTES` (default 50 MB) gets `413 {"code":"too_large"}`. Summaries
appear on the next `GET /api/notebooks/{id}`.

Other source routes: `GET /api/sources/{id}` (full text; `?part=n` adds the cited
passage), `DELETE /api/sources/{id}`, `GET /api/sources/{id}/structure` (JSON,
XML, CSV, TSV or HAR structure) and `POST /api/sources/{id}/diagnose` (HAR only).

## Chat with citations

```bash
curl -N -X POST $B/api/chat -H "$H" \
  -d '{"notebookId":"{id}","message":"What are the main risks?","sourceIds":["{sourceId}"]}'
```

The response is newline-delimited JSON:

| Event | Meaning |
|---|---|
| `{"type":"session","session":{...}}` | First event; the session used (created if `sessionId` was omitted) |
| `{"type":"citations","citations":[...]}` | Passages the answer may cite as `[n]` |
| `{"type":"notice",...}` | Non-fatal, such as a keyword fallback |
| `{"type":"delta","v":"..."}` | Next piece of answer text |
| `{"type":"done","id":"...","citations":[...],"stopped":false}` | Saved message id and only the citations actually marked |
| `{"type":"error","error":"..."}` | Failure |

- Join the `delta` values to get the answer. An answer with no `[n]` markers has
  empty citations, which means "not cited", so say so rather than implying support.
- Keep a conversation going by sending the same `sessionId`. An unknown one is 404.
- `400 no_config` means no model is configured. `400 too_long` means the message
  is over 20,000 characters. `400 no_sources` means `sourceIds` was `[]`.
- Closing the connection aborts the model request and saves the partial answer.

One-off grounded answers that are not saved to a session:
`POST /api/search/ask` with `{ "question", "notebookId?" }`. Search:
`GET /api/search?q=...&mode=text|vector&notebookId=`.

## Generate Studio artifacts

```bash
curl -s -X POST $B/api/generate -H "$H" -d '{"notebookId":"{id}","type":"report"}'
curl -s -X POST $B/api/generate -H "$H" \
  -d '{"notebookId":"{id}","type":"infographic","style":"bento","orientation":"landscape","detail":"concise"}'
```

`type` is `report`, `briefing`, `study_guide`, `faq`, `quiz`, `flashcards`,
`mindmap`, `timeline`, `slides` or `infographic`. Optional: `topic` (up to 2,000
characters), `sourceIds`, `difficulty` and `length` (study aids), `theme`
(slides), and for infographics `style`, `orientation`, `detail` and
`instructions` (up to 600 characters). `POST /api/infographic/suggest` returns up
to three styles that suit the sources. Unknown types and styles get `400`.

The response is `{ id, type, title, content, createdAt }`. For text formats the
body is `content.markdown`. Retrieve it later with `GET /api/artifacts/{id}`.

### Slow requests

`/api/generate`, `/api/podcast`, `/api/video`, `/api/motion`, `/api/training`,
`/api/podcast/{id}/narrate`, `/api/training/{id}/render`,
`/api/training/{id}/assets/find` and `/api/sources/{id}/diagnose` can run for
minutes. After about five seconds they return `200` and send spaces until done,
so a failure arrives as `{ "error": "...", "status": 502 }` in the body. Check
both:

```js
const res = await fetch(`${B}/api/generate`, { method: "POST", headers, body });
const data = await res.json();               // leading spaces are valid JSON whitespace
if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
```

## Audio and video (need Azure Speech; videos also need Python)

| Step | Call |
|---|---|
| Podcast script | `POST /api/podcast` `{ notebookId, preset?, speakers?, length? }`; the result has `stage: "script"` |
| Edit the script | `PATCH /api/podcast/{id}` (409 while narrating) |
| Narrate | `POST /api/podcast/{id}/narrate`; the artifact gains `audioUrl` and timed `turns` |
| Whiteboard plan | `POST /api/video` `{ notebookId, voice?, music? }` |
| Motion plan | `POST /api/motion` `{ notebookId, length?, tone?, ... }` |
| Training transcript | `POST /api/training` `{ notebookId, presenter?, voice?, composition? }` |
| Render | `POST /api/video/{id}/render` or `POST /api/training/{id}/render` |
| Wait | Poll `GET /api/artifacts/{id}` and read `progress.stage` |
| Play | `GET /api/video/{id}`, `GET /api/audio/{id}` |

Composed training videos return 409 until every visual is drawn
(`GET /api/training/{id}/raster` lists what is missing). Voices:
`GET /api/voices`; a sample: `GET /api/voices/preview?voice=...&style=...`.

## Notes and transformations

```bash
curl -s -X POST $B/api/notebooks/{id}/notes -H "$H" -d '{"title":"Finding","content":"..."}'
curl -s $B/api/transformations                              # built-in and custom prompts
curl -s -X POST $B/api/transformations/apply -H "$H" \
  -d '{"transformationId":"{tid}","sourceId":"{sourceId}"}' # 201 with the new note
```

## Errors to expect

| Status | Meaning |
|---|---|
| 400 | Invalid input, `no_config`, `no_sources`, `too_long`, or an unknown type or style |
| 401 | Missing credential, or the provider rejected the key (`code: "auth"`) |
| 403 | `host` or `csrf` check |
| 404 | Unknown id |
| 409 | Artifact is busy (narrating or rendering), or visuals are not drawn |
| 413 | Request body too large |
| 422 | A source that cannot be parsed, or not HAR for diagnose |
| 429 | Daily budget reached (`code: "budget"`) or the provider rate-limited |
| 502 | The provider or model returned something unusable |
