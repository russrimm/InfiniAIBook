# Recreation prompt

This is a beginner-level prompt for asking an LLM coding assistant to rebuild
OpenNotebook from scratch. It's written the way an intelligent but new vibe
coder might phrase it: it lists features, names a familiar stack, and asks the
assistant to go one step at a time.

The prompt describes the app's current feature set. It hasn't been tested
end to end, so treat what it produces as a starting point rather than an exact
copy of this repository.

## The prompt

```text
Hey! I want to build my own self-hosted AI research notebook app called "OpenNotebook".
I'm pretty new to coding so please explain what you're doing as you go and build it
step by step (don't try to do everything at once).

The idea: I upload my own documents, chat with them, and the AI turns them into cool
study stuff. Every answer should cite which document it came from, like [1] [2], and
I should be able to hover over a citation to see the exact text it used.

Tech stack I want:
- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- SQLite using Node's built-in node:sqlite (Node 22.13+) so there's nothing to compile
- Everything saved locally in a .data/ folder (database, audio, images, videos)
- It should work with Azure OpenAI (sign in with `az login` / DefaultAzureCredential,
  no API key needed) OR any OpenAI-compatible server like Ollama, LM Studio or
  llama.cpp. If I set AI_BASE_URL it should use that instead of Azure.
- Put all settings in a .env.example file with comments explaining each one

Main features:
1. Notebooks – a home page listing my notebooks, and I can create/delete them.
2. Sources – upload PDF, DOCX, TXT, MD, CSV, JSON, HTML and images (use a vision
   model to describe images). Also let me paste text, add a website URL, a YouTube
   link (get the transcript with Gemini if I have a key), or an RSS feed. Add a
   "discover sources" button that searches the web for a topic (DuckDuckGo by
   default, with Tavily/Brave/Google if I add a key) and a mini in-app browser.
   Process uploads in the background so I can keep adding stuff.
3. Chat – streaming answers that ONLY use the sources I've checked. Split
   documents into chunks, make embeddings, and search with both semantic
   and keyword search so names don't get missed.
4. Studio – buttons that generate:
   report, briefing doc, infographic, mind map, quiz, flashcards, study guide,
   FAQ, and timeline. Each should have its own nice interactive view (clickable
   mind map, a scored quiz, flippable flashcards, etc.), not just a blob of text.
   Have the AI return JSON and validate it (zod) so a bad response can't break
   the page.
5. Infographics with lots of styles (like 19 – illustrated as the default, plus
   data-driven, comparison, process flow, checklist, chalkboard, watercolor,
   neon, sketch note, etc.) and an "AI image" style that uses an image model.
6. Audio overview – two AI hosts talking about my sources like a podcast, turned
   into an MP3 with Azure Speech, with a transcript that highlights as it plays.
   Let me pick about 3, 6 or 10 minutes.
7. Whiteboard video – a hand drawing doodles for about 6 scenes with narration,
   rendered to MP4 with a Python script (numpy, Pillow, imageio-ffmpeg).
8. Export – copy/Markdown for everything, PNG for infographics and mind maps,
   MP3 for audio, and CSV for flashcards so I can import them into Anki/Quizlet.
9. When I open a notebook, check whether my linked web sources have changed and
   show a banner so I can choose "Re-index" or "Keep current". Don't count
   formatting changes or "checking your browser" bot pages as real changes.
10. A model picker in the UI so I can switch chat/embedding models.

Other stuff:
- Layout: sources on the left, chat in the middle, studio on the right.
- Handle rate limits (retry with backoff) and show friendly error messages
  instead of raw 401s/404s.
- Be careful about security when fetching URLs (don't let it fetch localhost or
  private network addresses). It's single-user with no login, so warn me in the
  README to only run it on localhost.
- Add a script `npm run check:ai` that tests if my model setup actually works.
- Write a good README with setup steps, plus CONTRIBUTING.md, SECURITY.md and
  an MIT LICENSE.

Start by setting up the project and database, then sources + chat, then the studio
features one at a time. After each step tell me how to run and test it before moving on.
```

## What the prompt leaves out

A prompt at this level won't reproduce the parts of OpenNotebook that were
tuned by hand. To get closer to the current app, follow up with prompts that
cover these details, all documented in the [README](../README.md):

- **Retrieval**: about 1,400-character chunks with 200 characters of overlap,
  and ranking that blends cosine similarity with lexical overlap at 85/15.
  Every chunk records which embedding model produced it, so stale vectors fall
  back to keyword-only ranking.
- **Change detection**: materiality is judged on words rather than lines. A
  change has to be at least 40 words *and* 1.5% of the page. A fetch that
  collapses below 40% of the indexed size counts as a bot wall. Checks are
  paced to once every six hours per source.
- **Model quirks**: the app probes once for reasoning models that reject a
  custom `temperature`, detects an API version that's really a model version,
  and halves the Studio context budget when a request is rate limited.
- **Speech**: uses the multi-speaker `en-Multitalker:DragonHDLatestNeural`
  voice, synthesizes turns in small batches, shapes pauses, and strips stage
  directions like `[MUSIC]` so they're never read aloud.
- **URL fetching**: private addresses are refused on every redirect hop, not
  only for the first URL, and fetches have caps on size, redirects and timeout.
