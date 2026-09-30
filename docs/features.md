# Features

| | |
|---|---|
| **Sources** | Upload PDF, DOCX, TXT, MD, CSV, JSON, HTML, **images** (described by a vision model) or **audio/video** (transcribed); paste raw text; reuse a source from **another notebook**; add a URL — including **YouTube links** and **RSS/Atom feeds**; or **discover sources** by describing a topic and picking from web results; or browse the web in-app and keep what is useful. Ingestion runs in the background, three items at a time (the rest wait as "Queued"), so you can keep adding while earlier items process. Uploads are limited to 50 MB each (`MAX_UPLOAD_BYTES`). |
| **Grounded chat** | Streaming answers built only from the sources you have selected, with inline citations `[1]`. Click (or tab to) a citation to open its source with the cited passage highlighted. **Stop** ends an answer early and keeps what was written. Keep any number of separate **chat sessions** per notebook. |
| **Notes** | Write your own Markdown notes, save any chat answer as a note (citations kept), and turn a note into a source. |
| **Transformations** | Reusable prompts — built-in (dense summary, key insights, analyze paper, glossary…) or your own — run on one source and saved as a note. |
| **Search everything** | Keyword or semantic search across every notebook's sources and notes, plus a one-shot grounded **Ask** over the whole library. |
| **Studio** | Fourteen generators, each returning a structured, validated artifact rendered with a purpose-built view — not a wall of text. |
| **About** | The ⓘ button in the home and workspace headers opens app, author, source and MIT license details. |
| **Everything is local** | Sources, chunks, embeddings, chat history, artifacts, generated audio, voice samples and images live under `.data/`. |
| **Undo deletes** | Deleting a source, artifact, note, chat or notebook hides it right away and offers **Undo** for 8 seconds before anything is removed. |

## Studio formats

| Format | Output |
|---|---|
| 🎧 Audio overview | One to four speakers discuss your sources — review and edit the script, then real MP3 audio with a synced, clickable transcript, at roughly 3, 6 or 10 minutes |
| 🎬 Whiteboard video | A hand draws your sources as marker doodles, narrated — six scenes, script reviewed before rendering, MP4 |
| 🎞️ Motion explainer | A narrated 2D animated story from your sources: characters, kinetic headlines, stat cards, optional music — five, seven or nine scenes, MP4. **Customizable**: length, tone, audience, six illustration styles, color palettes (or your own colors), your own character or none, a closing call to action, and 720p or 1080p |
| 🧑‍🏫 Training video | A trainer's script from your sources and notes, edited then rendered by a lip-synced Azure avatar, MP4 |
| 📽️ PowerPoint deck | Title, agenda, content slides with speaker notes and a sources slide; download as PPTX |
| 📄 Report | Executive summary, analytical sections, key takeaways, open questions |
| 🧾 Briefing doc | Under 700 words: bottom line, evidence, risks, next steps |
| 📊 Infographic | Headline stats, themed sections, key takeaway — **20 styles**, visual guide by default |
| 🕸️ Mind map | Interactive concept tree — starts collapsed, expand topic by topic |
| 🧠 Quiz | Multiple-choice, interactive, scored, with explanations and retry-the-misses |
| 🗂️ Flashcards | Two-sided deck: flip, self-grade, shuffle, drill the ones you missed |
| 🎓 Study guide | Core concepts, glossary table, short-answer questions + answer key |
| ❓ FAQ | Collapsible Q&A the sources actually answer |
| 🗓️ Timeline | Chronology extracted from the material |

The four spoken formats stop at an **editable script** before anything is
narrated or rendered, take **narration instructions** and a strict
**word-replacement list** (saved per notebook), and can add **background
music** from an in-app library of uploaded tracks. See
[Spoken formats](studio.md#spoken-formats-script-review-instructions-and-music).

Every artifact can be copied or exported to Markdown; audio can be downloaded as
MP3, decks as PPTX, and flashcards export as a two-column table that Anki and
Quizlet accept.

See [Study aids, mind maps and exporting](studio.md#exporting) for export details.
