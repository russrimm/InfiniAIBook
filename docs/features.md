# Features

| | |
|---|---|
| **Sources** | Upload PDF, DOCX, PPTX (slide text and speaker notes), TXT, MD, CSV/TSV, JSON, HAR, XML (including GPX/KML), HTML or **audio/video** (transcribed); drop **images** (described by a vision model), or a **ZIP archive** (every supported file inside becomes its own source); **Paste text**; reuse a source **From other notebooks**; **Add link** — including **YouTube links** and **RSS/Atom feeds**; **Search web** by describing a topic and picking results; or **Browse web** in-app. Discovery tries Bing's public RSS search first, then configured API fallbacks. **Microsoft Learn** explicitly imports full official documentation pages as saved sources. Ingestion runs in the background, three items at a time (the rest wait as "Queued"), so you can keep adding while earlier items process. Uploads default to 50 MB each (`MAX_UPLOAD_BYTES`); a larger PPTX is read in the browser and only its text is imported. See [Sources](sources.md). |
| **Grounded chat** | Streaming answers from selected saved sources, with optional per-notebook **Use live Microsoft Learn in chat** (off by default). Live retrieval also works without selected saved sources and never includes unselected saved documents. Inline citations `[1]` open the highlighted source passage or the saved Learn excerpt with its original-page link. Live excerpts survive chat history, saved notes and notebook export/import; they do not become sources or feed Studio, discussions or library-wide Search/Ask unless explicitly imported. **Stop** keeps a partial answer. Keep separate **chat sessions** per notebook. |
| **Notes** | Write your own Markdown notes, save any chat answer as a note (citations kept), and turn a note into a source. |
| **Transformations** | Reusable prompts — built-in (dense summary, key insights, analyze paper, glossary…) or your own — run on one source and saved as a note. |
| **Live discussions** | Talk through your sources out loud with a realtime voice AI: discussion, debate, Q&A, interview an expert, get interviewed, oral quiz or Socratic tutor. Interrupt any time; it searches your sources mid-conversation and shows clickable citations. Save a call as a note with takeaways and the cited transcript. See [Live discussions](discussions.md). |
| **Search everything** | Keyword or semantic search across every notebook's sources and notes, plus a one-shot grounded **Ask** over the whole library. |
| **Screen helper** | Share any app's window, say what you are trying to do, and a vision model coaches you one step at a time, with a numbered box on a screenshot showing where to click. **Auto-watch** is off by default; enable it to suggest steps after the screen changes and settles. Screenshots go to the configured vision model and are not stored by the app. Inside a notebook, save the conversation as a note without screenshots. See [Screen helper](screen-helper.md). |
| **Structure explorer** | Open a structured source and choose **Explore structure**. JSON/XML has a filterable tree and graph with path statistics; CSV/TSV has Columns and Rows views. HAR adds Overview, filterable/sortable Requests, Waterfall, Server timing, Redirect chains, CSV export and Sanitized HAR download. **Diagnose with AI** sends a redacted digest to the Studio model, not the raw archive. Review exports before sharing. |
| **Studio** | Fourteen generators, each returning a structured, validated artifact rendered with a purpose-built view — not a wall of text. |
| **Model picker** | Switch the chat, embedding, image and vision models from the workspace header. A saved choice overrides the environment until you reset it; after changing the embedding model, existing chunks rank by keyword until the notebook is [re-embedded](grounding.md). See [Configuration](configuration.md#models-and-what-theyre-used-for). |
| **Reduced motion** | When the OS or browser asks for reduced motion, entrances fade instead of rising, spinners and shimmers pulse in place, mind-map nodes jump instead of sliding, and scripted scrolling jumps instead of gliding. |
| **Help & about** | The **? Help** button in the home and workspace headers opens grouped, expandable instructions for notebooks, every source workflow, chat/notes/search, all fourteen Studio formats, live tools, models and privacy. Jump links and topic-specific documentation links keep the instructions navigable. About includes an author email link and title, the full MIT permission/warranty/liability notice, the open-notebook inspiration credit, and third-party/GSAP license notices without implying Microsoft endorsement. |
| **Notebook portability** | **Export** in a notebook downloads saved text, notes, chats/citations, artifacts and available finished media as a ZIP; narration defaults and the live Learn setting travel with it. **Import a notebook** on the home page restores a new independent copy. This is not a full server backup: keep original files and shared music/watermark libraries separately. |
| **Everything is local** | Sources, chunks, embeddings, chat history, artifacts, generated audio, voice samples and images live under `.data/`. |
| **Undo deletes** | Deleting a source, artifact, note, chat or notebook hides it right away and offers **Undo** for 8 seconds before anything is removed. |

## Studio formats

| Format | Output |
|---|---|
| 🎧 Audio overview | One to four speakers discuss your sources — review and edit the script, then real MP3 audio with a synced, clickable transcript, at roughly 3, 6 or 10 minutes |
| 🎬 Whiteboard video | A hand draws your sources as marker doodles, narrated — choose a length preset or custom scene count, edit the script, then render MP4 |
| 🎞️ Motion explainer | A narrated 2D animated story from your sources: characters, kinetic headlines, stat cards, optional music — choose a length preset or custom scene count, then render MP4. **Customizable**: tone, audience, six illustration styles, color palettes (or your own colors), your own character or none, a closing call to action, 720p or 1080p, and gentle, lively or still character motion |
| 🧑‍🏫 Training video | A trainer's script from your sources and notes, edited then rendered by a lip-synced Azure avatar, MP4 |
| 📽️ PowerPoint deck | Title, agenda, content slides with speaker notes and a sources slide; download as PPTX |
| 📄 Report | Executive summary, analytical sections, key takeaways, open questions |
| 🧾 Briefing doc | Under 700 words: bottom line, evidence, risks, next steps |
| 📊 Infographic | Headline stats, themed sections, key takeaway — **33 styles** with a live example of each before you generate, style suggestions, orientation, detail level and a free-text description; visual guide by default |
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
The three video formats can also carry a **watermark**, text or an uploaded
image, in any of nine positions; see [Watermark](studio.md#watermark).

Every artifact can be copied or exported to Markdown; audio can be downloaded as
MP3, decks as PPTX, and flashcards export as a two-column table that Anki and
Quizlet accept.

See [Study aids, mind maps and exporting](studio.md#exporting) for export details.
