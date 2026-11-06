"use client";

import {
  APP_VERSION, AUTHOR, AUTHOR_MAILTO, AUTHOR_TITLE,
  GITHUB_URL, LINKEDIN_URL, MIT_LICENSE, REPO_URL,
} from "@/lib/about";
import Logo from "./Logo";
import { useDialog } from "./useDialog";

const DOCS = `${REPO_URL}/blob/main/docs`;

const HELP: {
  id: string;
  title: string;
  topics: { title: string; body: string[]; doc?: string }[];
}[] = [
  {
    id: "help-notebooks",
    title: "Notebooks and workspace",
    topics: [
      {
        title: "Create, rename and delete notebooks",
        body: [
          "Choose + New notebook on the home page, or open a card under Your notebooks. Edit Notebook title in the workspace header to rename it; it saves after a short pause or when you leave the field. Back to notebooks returns home.",
          "Delete a notebook from its home-page card and confirm Delete notebook. Deleting a notebook also deletes its sources, chats, notes and generated items. Deleted notebooks, sources, notes, chats and Studio artifacts offer Undo for 8 seconds before removal.",
        ],
        doc: "getting-started.md",
      },
      {
        title: "Export and import a notebook",
        body: [
          "Export in the notebook header downloads a portable ZIP containing saved source text, notes, chat sessions and citations, Studio artifacts and available finished media. Narration defaults and the live Microsoft Learn setting travel with it.",
          "Choose Import a notebook on the home page to restore that ZIP as a new, independent notebook. Imported sources use keyword ranking until re-embedded. This is different from dropping a ZIP into Sources, which imports its supported files as separate sources. Keep originals and shared music or watermark assets separately; a notebook export is not a full server backup.",
        ],
        doc: "API.md#notebooks",
      },
      {
        title: "Find panels, getting-started steps and display settings",
        body: [
          "Add sources opens the Sources panel. Pin it to keep it open on wide screens, or close it for more chat space. Switch between Studio and Notes on the right; on narrow screens use the Sources, Chat, Studio and Notes tabs.",
          "The getting-started guide in an empty chat walks through Add sources, Choose sources and Open Studio, with Back, Next, Use all sources and Choose in Sources controls. The theme button cycles Auto (system), Light and Dark. Reduced motion follows your OS or browser preference. Dialogs support Tab navigation, Escape to close and focus returning to the opener.",
        ],
        doc: "features.md",
      },
    ],
  },
  {
    id: "help-sources",
    title: "Sources and evidence",
    topics: [
      {
        title: "Upload files, add links or paste text",
        body: [
          "In Sources, use Drop files or click to upload, Add link or Paste text. Supported files include PDF, DOCX, PPTX, TXT, MD, CSV/TSV, JSON, HAR, XML (including GPX/KML), HTML and ZIP. PowerPoint imports slide text, tables and speaker notes, not text inside pictures. Protected or legacy decks need an unprotected .pptx copy.",
          "Drop images (PNG, JPEG, WebP, GIF or BMP), or add a direct image link, to describe and index them with a vision model. Audio/video files (MP3, MPGA, MPEG, M4A, WAV, OGG/OGA, FLAC, WebM and MP4) and direct media links need a transcription model. Add link also accepts web pages, RSS/Atom feeds and YouTube URLs.",
          "Other plain-text and code files can also be dropped, including JSONL/GeoJSON and XML-family SVG, RSS, Atom, XSD and XHTML files. ZIP imports create a source per supported file and report skipped or failed items. Uploads run in the background, three at a time; the rest show Queued. Read warnings before dismissing them. Upload limits are configured on the server; oversized PPTX files can import only their text through the browser.",
        ],
        doc: "sources.md",
      },
      {
        title: "YouTube transcripts and import problems",
        body: [
          "Add a YouTube URL with Add link. Gemini transcription is optional and uses GEMINI_API_KEY; YOUTUBE_API_KEY is separate and adds metadata, not permission to download other people's captions. If only a description can be imported, it is labeled description only and a warning explains the missing transcript.",
          "For blocked web pages, missing captions or scanned PDFs without extractable text, use Paste text to add text you can access and have permission to use. Check the actual source reader before relying on an import.",
        ],
        doc: "sources.md#youtube-sources",
      },
      {
        title: "Search web and Browse web",
        body: [
          "Search web opens Discover sources. Describe a topic, press Search, review snippets and preview links, then choose results and Add sources. Existing pages are marked already added; may block import results are not selected by default. Select all and Clear selection change the result selection, not the notebook's chat context.",
          "Web discovery tries Bing's public RSS search first, with optional configured Tavily, Brave and Google API fallbacks. No search API key is required for Bing, but public endpoints can block requests.",
          "Browse web has an address bar, Go, Back and Add to sources. Already-saved pages are labeled; Add again deliberately creates another saved copy. Pages that refuse embedding use a reader view with extracted text and outbound links when they can be fetched. This does not bypass a publisher's access restrictions.",
        ],
        doc: "sources.md#discover--search-web",
      },
      {
        title: "Import Microsoft Learn pages",
        body: [
          "Open Sources > Microsoft Learn, search official documentation, select pages and choose Add sources. This explicitly fetches the full pages through the public Microsoft Learn MCP server and saves them as URL sources, not just search snippets. No additional API key is needed; the server must be able to reach learn.microsoft.com.",
          "Imported pages can be selected for Chat, Studio, Live discussion and library-wide Search/Ask like other saved sources. Already imported pages are marked; linked-source updates apply to these pages too.",
        ],
        doc: "sources.md#microsoft-learn-imports-and-live-chat",
      },
      {
        title: "Use live Microsoft Learn in chat",
        body: [
          "In Sources > Microsoft Learn, turn on Use live Microsoft Learn in chat. It is off by default and saved per notebook. Each new chat question retrieves fresh documentation alongside only the saved sources you ticked, and it also works with no saved sources selected.",
          "Live results do not create notebook sources. Their numbered citations open the exact excerpt saved with the answer and a link to the original page. These citation snapshots remain in chat history, saved notes and notebook exports even if the page changes.",
          "Live Learn applies only to notebook chat, not Studio, Live discussion or library-wide Search/Ask. Import pages explicitly for those tools. Turn it off for saved-source-only chat. Connection errors are shown; no matches are reported rather than silently presented as fresh evidence.",
        ],
        doc: "sources.md#microsoft-learn-imports-and-live-chat",
      },
      {
        title: "Reuse, select and update saved sources",
        body: [
          "From other notebooks opens Add from your library. Filter by source or notebook, select sources and choose Add. Their text, summaries and embeddings are copied without fetching them again; the copies are independent.",
          "Tick individual sources, Select all or Deselect all to control Chat and Studio. Newly added sources are ticked automatically; the header shows how many are in use. With nothing ticked, saved-source chat and Studio will not silently use everything. Live Learn is the chat-only exception described above; training videos also use all notebook notes.",
          "Linked pages and feeds are checked in the background when a notebook opens, normally at most once every six hours per source. Open the changed-source banner's Review, compare changes and choose Re-index, Keep current or Decide later. Nothing is replaced automatically.",
        ],
        doc: "sources.md#keeping-linked-sources-current",
      },
      {
        title: "Read sources and explore structured data",
        body: [
          "Click a source to read its indexed text and summary; original opens its URL when available. Numbered citations open the highlighted passage, or show the cited excerpt if its place in the current text cannot be found.",
          "For JSON (including JSONL/GeoJSON), XML-family files (GPX, KML, SVG, RSS, Atom, XSD and XHTML), CSV/TSV and HAR, choose Explore structure. Inspect a filterable path tree or graph, adjust Depth and Hide values, zoom and select paths for types, counts and value statistics; tabular data has Columns and Rows views with column statistics.",
          "HAR adds Overview, searchable/filterable/sortable Requests, Waterfall, Server timing, Redirect chains and request headers, cookies, query, body and timing details. Filter requests by method, status, type or third-party hosts. Export filtered requests as CSV or download Sanitized HAR. Diagnose with AI uses the Studio model on a redacted digest, not the raw archive. Review any sanitized file before sharing it.",
        ],
        doc: "features.md",
      },
    ],
  },
  {
    id: "help-chat",
    title: "Chat, notes and search",
    topics: [
      {
        title: "Ask, stop and manage chat sessions",
        body: [
          "Type in Question and send, or use a suggested question. Answers stream from selected source passages, plus fresh Microsoft Learn passages only when live Learn is enabled. Click or tab to a numbered citation to inspect the evidence. Check cited passages before relying on or sharing an AI answer.",
          "Stop ends generation and keeps the partial answer. Save to notes keeps an answer and its citations. Use the Chat picker to switch conversations, + New for a fresh one, Rename this chat to change its name (Enter saves, Escape cancels), or Delete this chat with Undo. A new chat is saved on its first question; conversation context stays in its own session.",
        ],
        doc: "notes-and-search.md#chat-sessions",
      },
      {
        title: "Write notes and run transformations",
        body: [
          "Open Notes and choose + Note, enter a title and Markdown, switch between Edit and Preview, then Save (Ctrl+S or Command+S also works). Opening a saved note lets you edit or delete it; closing unsaved edits asks before discarding them.",
          "Add as source copies a saved note into Sources so Chat and Studio can use it. Later note edits do not update that copy. Save to notes under a chat answer preserves citations.",
          "Transformations in Notes manages reusable prompts. Built-ins include Dense summary, Key insights, Analyze paper, Explain simply, Table of contents, Reflection questions, Glossary and Action items; add, edit or delete your own. To run one, open a source, choose a prompt under Transform and press Apply \u2192 note. The cited result becomes a note.",
        ],
        doc: "notes-and-search.md",
      },
      {
        title: "Search and Ask across notebooks",
        body: [
          "Search all on the home page, or Search in a notebook header, opens Search your library. Keyword matches words; Semantic uses embeddings and falls back to keyword ranking when unavailable. Results include source passages and notes, with links back to their notebooks.",
          "Ask writes one grounded answer across matching saved sources in the library. From a notebook, Only this notebook narrows either search or Ask. This is separate from the notebook's ticked-source selection and does not retrieve live Microsoft Learn.",
        ],
        doc: "notes-and-search.md#search-and-ask",
      },
    ],
  },
  {
    id: "help-studio",
    title: "Studio formats and exports",
    topics: [
      {
        title: "Create, Library and artifact exports",
        body: [
          "Studio > Create groups formats under Audio & video, Documents, Visuals and Study. Tick sources first, enter an optional Focus to steer the result, open a card's Options and press Generate. Jobs run in the background and report errors on their card; finished results appear in Library and open when you are not already viewing something else.",
          "Open a Library item to read, play, copy or export it, or use its delete control with Undo. Copy and Export produce Markdown (flashcards label that download MD). Other outputs offer PNG, PPTX, CSV, MP3 or MP4 as described below. Media downloads are available after narration or rendering finishes.",
        ],
        doc: "studio.md",
      },
      {
        title: "Report, Briefing doc, Study guide, FAQ and Timeline",
        body: [
          "Report creates an executive summary, analysis, key takeaways and open questions. Briefing doc creates a shorter bottom line, evidence, risks and next steps. Study guide adds concepts, a glossary, practice questions and an answer key. FAQ provides expandable questions and answers. Timeline orders events from the material.",
          "Use each card's Length option (Short, Standard or Long) and the shared Focus before Generate. All five retain citations and can be copied or exported as Markdown; unsupported details should not be treated as facts.",
        ],
        doc: "studio.md",
      },
      {
        title: "PowerPoint deck",
        body: [
          "Set Theme (Midnight, Light, Ocean or Sunset) and Deck length in Options, then Generate. The deck includes title, agenda and content slides, speaker notes and a sources slide.",
          "Use slide thumbnails or arrow keys to preview it. Citations are in speaker notes, not the slide text. PPTX downloads a real presentation with its theme and notes; Export downloads Markdown.",
        ],
        doc: "studio.md#powerpoint-deck",
      },
      {
        title: "Infographic styles and suggestions",
        body: [
          "Open the style gallery from the Infographic card to browse or search styles and filter Drawn by AI, Structure-led or Look-led. Compare examples; AI-drawn examples are labeled layout sketches, not generated previews. Use this style selects a style; Generate in the gallery also starts generation.",
          "Suggest styles for my sources recommends styles for your selected sources and Focus. Choose Orientation (landscape, portrait or square), Level of detail, and Describe the infographic you want. Drawn styles require an image model; Illustrated is the HTML alternative. Open a finished infographic for PNG or Markdown export.",
        ],
        doc: "infographics.md",
      },
      {
        title: "Mind map",
        body: [
          "Choose Length in Options and Generate a concept tree. The map starts collapsed; click a node to expand one level or collapse its branch, or use Expand all and Collapse all. Nodes are keyboard reachable and show source notes as tooltips.",
          "PNG exports the visible map; Export saves a Markdown outline. Expand the branches you want visible before making the image.",
        ],
        doc: "studio.md#mind-maps",
      },
      {
        title: "Quiz and Flashcards",
        body: [
          "Set Level (Easy, Medium or Hard) and Length (Short, Standard or Long) before generating either study aid. Quiz scores your submitted multiple-choice answers, shows cited explanations and lets you retry missed questions or start again.",
          "Flashcards lets you flip with a click or Space, mark Missed it with 1 or Got it with 2, step with arrow keys, Shuffle, Browse all or review missed cards. Study progress is saved in this browser; clearing site data clears it. CSV exports two columns for Anki/Quizlet; MD exports a Markdown table.",
        ],
        doc: "studio.md#study-aids",
      },
      {
        title: "Audio and video: review scripts before rendering",
        body: [
          "Audio overview, Whiteboard video, Motion explainer and Training video first generate editable scripts. Review titles, wording and speakers or scenes before Narrate (audio) or Render video. Save edits, then use Edit script for finished audio/whiteboard/motion work or the training video's Script tab to revise and narrate or render again. Script generation still uses your model; narration and rendering can incur separate charges.",
          "Instructions > Tell the script writer steers newly generated scripts. Always replace enforces whole-word, case-insensitive replacements on scripts and again before speech; leave the replacement blank to remove a term. Save as notebook default reuses these instructions across the four spoken cards.",
          "Music offers No music, Random track or an uploaded track, a preview and volume. Upload or delete tracks in its library. Videos also offer Mark: text or an uploaded image, nine positions, size and opacity. Music and watermark changes require another narration or render. Use only assets you have rights to use; failed music or watermark steps report when output is kept without them.",
        ],
        doc: "studio.md#spoken-formats-script-review-instructions-and-music",
      },
      {
        title: "Audio overview",
        body: [
          "Choose an Audio profile for one to four speakers, then each speaker's voice, optional name and role/personality. Audition voices, choose Audio length and Speaking speed, and select Natural dialogue, Even delivery or Fixed voices. Fixed voices requires supported standalone voices; the card explains unsupported choices.",
          "Generate the dialogue, edit chapters and speaker lines, reorder or remove lines, then Narrate with configured Azure Speech. The player has play/pause, 10-second skips, a scrubber and Jump to topic chapters; click transcript lines to seek. Download MP3 or export the Markdown transcript; Edit script lets you narrate again.",
        ],
        doc: "audio-overviews.md",
      },
      {
        title: "Whiteboard video and Motion explainer",
        body: [
          "Whiteboard video creates narrated marker drawings. Choose Voice and a length preset or Custom scene count. Edit each scene's title, drawing description and narration, add, remove or reorder scenes, then Render video.",
          "Motion explainer creates a 2D story with headlines, characters, callouts and stats. Choose Voice and a length preset or Custom scene count; Customize sets Tone, Audience, Look, Colors (including custom colors), Character (including your own or none), Motion, Closing and Quality (720p or 1080p). Reset restores customization defaults.",
          "Both need an image model, Azure Speech and the server's video-rendering dependencies. Follow stage progress, read any failure message, and play or download MP4 when ready. Edit script and render again to change narration or drawings; re-rendering redraws artwork and can incur new image and speech costs.",
        ],
        doc: "motion-explainers.md#customizing-a-video",
      },
      {
        title: "Training video: presenter, script and live preview",
        body: [
          "Training video uses selected sources, all notebook notes and Focus. Options include Trainer, Compare, Presenter voice and supported delivery style, Training video length, Background, Style (Presenter with slides and visuals or Presenter only) and Visual theme, plus music, watermark and instructions.",
          "Generate the transcript; composed mode also plans visuals and can fetch or generate pictures before rendering. Use Script to edit sections, their order, presenter, voice and Body language or supported section gestures. Compare presenters opens the gallery. Preview live (VASA-2) speaks the transcript interactively with a supported Azure Speech resource; it is a separate live session, is not recorded into the MP4 and can incur speech charges.",
          "Render video submits the avatar work and shows stage progress or failure details. MP4 downloads the finished file. Script changes need Render again; when only visuals, design or music change, Recompose video reuses unchanged cached presenter clips instead of billing for new avatar speech.",
        ],
        doc: "training-videos.md",
      },
      {
        title: "Training visuals, design, animation and preview",
        body: [
          "In a composed training video, Visuals lets you Plan all visuals again or Plan this section. Select words and Add visual at selected words to anchor a title, objectives, bullets, key number, quote, knowledge check, AI image, screenshot/picture, notebook infographic or Back to presenter cue. Edit its anchor, content, layout, transition, picture motion and timing shift; fix anchors marked not found.",
          "Add pictures to missing visuals, Find another Microsoft Learn picture, draw with the image model, or upload, paste or capture your own screenshot. Preview plays the timeline and its visual markers open the corresponding editor. Retime or Save and retime refreshes speech timing; timing can use paid, cached speech synthesis, or silent estimates when Speech is unavailable.",
          "Design sets Style, Theme, default layout and transition, presenter location/size, opening and closing cards, section cards, presenter name/role, Logo, Resolution and Captions (burned in, WebVTT or none). Animation offers None, Light (transitions only), Full or individual toggles for transitions, fades, picture push-ins, bullet reveals and presenter movement. Download separate captions when available. These changes apply to preview and the recomposed MP4.",
        ],
        doc: "training-videos.md#presenter-with-visuals",
      },
    ],
  },
  {
    id: "help-live-settings",
    title: "Live tools, models and privacy",
    topics: [
      {
        title: "Live discussion",
        body: [
          "Choose Studio > Create > Live > Live discussion with at least one saved source ticked. Select Discussion, Debate, Q&A, Interview an expert, Get interviewed, Oral quiz or Socratic tutor, plus a voice and optional focus or debate position, then start the call.",
          "Allow microphone access over HTTPS or localhost. Talk, interrupt, mute, type instead or use quick actions such as Where's that from?, Simpler, Go deeper and Recap so far. Quiz/interview modes add Hint and Skip; Debate adds Rate my argument. Citations open saved source passages.",
          "End discussion, then Save to notes to keep takeaways and the cited transcript. Calls are not saved until you choose to save. This needs a configured realtime voice model and does not use live Microsoft Learn; explicitly imported Learn sources can be selected.",
        ],
        doc: "discussions.md",
      },
      {
        title: "Screen helper",
        body: [
          "Open Screen helper from the home or notebook header, type a goal and choose Share screen & ask. Select a window, screen or tab in the browser's sharing prompt. The helper sends a screenshot to Models > Image reading and explains the next step with an approximate highlighted control; it cannot click or type for you.",
          "Auto-watch is off by default. Turn it on to send another screenshot after the shared screen changes and settles; turn it off for manual follow-ups only. Read steps aloud speaks new steps. Use quick replies, Show on screenshot, Stop sharing, Share screen or Start over as needed.",
          "Hide secrets before sharing. Screenshots go to your configured vision model and are not stored by the app. In a notebook, Save as note keeps the goal and conversation without screenshots. Requires a vision model and a desktop browser on HTTPS or localhost.",
        ],
        doc: "screen-helper.md",
      },
      {
        title: "Models, optional services and spend",
        body: [
          "Models in the workspace header offers Generation model, Embedding model, Image model and Image reading. Choose available models and Save; Reset to defaults removes saved overrides. These saved choices apply to the app, not just this notebook. Image reading must support vision; Image model draws pictures.",
          "After switching embedding models, older vectors rank by keyword until that notebook is re-embedded; see the grounding documentation's re-embed API instructions. The optional Studio script model, transcription, Azure Speech/avatar and realtime models are configured on the server, not in this picker.",
          "A working chat endpoint is the starting requirement; optional services enable their respective features. If the daily estimated spend ceiling is enabled, generation stops at the limit and the header warns as it runs low. Configure DAILY_BUDGET_USD on the server; 0 disables the ceiling. Estimates are not a provider billing guarantee.",
        ],
        doc: "configuration.md#models-and-what-theyre-used-for",
      },
      {
        title: "Data, password protection and responsible use",
        body: [
          "Notebooks, indexed text, embeddings, chats, artifacts and media are stored on your app server under DATA_DIR (otherwise .data). Local storage does not mean all processing stays on your device: configured model and speech services receive content needed for their work, and web/Learn requests leave the server.",
          "Without INFINIAIBOOK_PASSWORD, anyone who can reach the app can use it and its model quota. Set password protection or an authenticating proxy before exposing it; Sign out appears on the home page when app password protection is enabled. See the repository's SECURITY.md for deployment guidance.",
          "AI output can be wrong even with citations. Review evidence, generated scripts, imported material and any redacted export before sharing. Respect source copyrights, media rights and the terms of services you configure.",
        ],
        doc: "getting-started.md",
      },
    ],
  },
];

export default function AboutModal({ onClose }: { onClose: () => void }) {
  const { dialogRef, backdropProps } = useDialog(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="fade-up card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden !p-0 outline-none"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <Logo size={32} />
          <div className="flex-1">
            <h2 id="about-title" className="text-[15px] font-semibold">
              InfiniAIBook
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              Help and about: a self-hosted research notebook for grounded chat, notes and
              Studio artifacts.
            </p>
          </div>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section aria-labelledby="help-title">
            <h3 id="help-title" className="text-[13px] font-semibold">
              How InfiniAIBook works
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
              Start with a notebook, add and select sources, then ask in Chat or create in Studio.
              Expand a topic for instructions and links to the full documentation.
            </p>
            <nav aria-label="Help topics" className="my-3 flex flex-wrap gap-2 text-[13px]">
              {HELP.map((group) => (
                <a key={group.id} href={`#${group.id}`} className="btn !py-1 !text-[13px]">
                  {group.title}
                </a>
              ))}
              <a href="#about-details" className="btn !py-1 !text-[13px]">About and licenses</a>
            </nav>
            {HELP.map((group) => (
              <section key={group.id} aria-labelledby={group.id} className="mt-4">
                <h4 id={group.id} className="mb-2 scroll-mt-3 text-[13px] font-semibold">
                  {group.title}
                </h4>
                <div className="space-y-2">
                  {group.topics.map((topic, index) => (
                    <details
                      key={topic.title}
                      open={group.id === "help-notebooks" && index === 0}
                      className="rounded-xl border border-[var(--border)] px-3 py-2"
                    >
                      <summary className="cursor-pointer text-[13px] font-medium">
                        {topic.title}
                      </summary>
                      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-[var(--muted)]">
                        {topic.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                        {topic.doc && (
                          <a
                            className="inline-block text-[var(--accent)] underline underline-offset-2"
                            href={`${DOCS}/${topic.doc}`}
                            aria-label={`Learn more: ${topic.title}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Learn more
                          </a>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </section>

          <h3 id="about-details" className="mt-5 scroll-mt-3 text-[13px] font-semibold">About</h3>
          {APP_VERSION && (
            <p className="mt-1 text-sm text-prose" data-testid="app-version">
              Version {APP_VERSION}
            </p>
          )}
          <p className="mt-1 text-sm text-prose">
            <a className="text-[var(--accent)] underline underline-offset-2" href={AUTHOR_MAILTO}>
              {AUTHOR}
            </a>
            {`, ${AUTHOR_TITLE}`}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
            The author&apos;s job title does not imply Microsoft sponsorship or endorsement.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            <a className="btn !text-[13px]" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            <a className="btn !text-[13px]" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a className="btn !text-[13px]" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              Source repository
            </a>
          </div>

          <section aria-labelledby="open-source-title" className="mt-5 text-[13px] leading-relaxed text-[var(--muted)]">
            <h3 id="open-source-title" className="text-[13px] font-semibold text-[var(--fg)]">
              Open source and third-party notices
            </h3>
            <p className="mt-2">
              InfiniAIBook is open-source software under the MIT License below, including its
              permission, attribution, &quot;AS IS&quot; warranty and liability terms. Preserve the
              copyright and permission notice in copies or substantial portions of the software.
            </p>
            <p className="mt-2">
              Inspired by{" "}
              <a className="text-[var(--accent)] underline" href="https://github.com/lfnovo/open-notebook" target="_blank" rel="noopener noreferrer">
                open-notebook
              </a>
              . Built with Next.js, React, TypeScript, SQLite and other{" "}
              <a className="text-[var(--accent)] underline" href={`${REPO_URL}/blob/main/package.json`} target="_blank" rel="noopener noreferrer">
                third-party dependencies
              </a>
              . Their copyrights, licenses and bundled notices remain applicable; this
              project&apos;s MIT License does not replace them.
            </p>
            <p className="mt-2">
              The optional HyperFrames compositor uses bundled GSAP: Copyright 2025,
              GreenSock. All rights reserved. Subject to the{" "}
              <a className="text-[var(--accent)] underline" href="https://gsap.com/standard-license/" target="_blank" rel="noopener noreferrer">
                GSAP standard license
              </a>
              . Imported content, uploaded assets and connected services have their own rights
              and terms; the app&apos;s license does not grant rights to them.
            </p>
          </section>
          <details open className="mt-4">
            <summary className="cursor-pointer text-[13px] font-semibold">
              MIT License: permission, warranty and liability
            </summary>
            <pre data-testid="mit-license" className="mt-2 rounded-xl border border-[var(--border)] bg-well p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-prose-soft">
              {MIT_LICENSE}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
