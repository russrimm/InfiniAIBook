# Study aids, mind maps and exporting

Infographics, audio overviews, whiteboard videos, motion explainers and training
videos have their own pages: [Infographic styles](infographics.md),
[Audio overviews](audio-overviews.md), [Whiteboard videos](whiteboard-videos.md),
[Motion explainers](motion-explainers.md) and [Training videos](training-videos.md).

The Studio panel has two views. **Create** lists the formats, grouped into
**Audio & video**, **Documents** (report, briefing, study guide, FAQ, timeline
and PowerPoint deck), **Visuals** (infographic and mind map) and **Study** (quiz
and flashcards). **Library** lists everything already generated in the
notebook; open an item to read, play or export it.

Every format uses only the sources you have ticked, steered by the optional
**Focus** box at the top of Create. Formats with settings fold them behind
**Options ▸**, which shows a one-line summary of the current choices while it is
closed; nothing starts until you press **Generate**. A job runs in the
background, a status line at the top of Studio says what is running, and the
result opens when it is ready. If a job fails, the error appears on that
format's card.

## Spoken formats: script review, instructions and music

The audio overview, whiteboard video, motion explainer and training video all
work the same way.

### Review the script first

Generating one of these writes the **script only** and opens it in an editor.
Nothing is narrated, drawn or rendered until you press **Narrate** (audio) or
**Render video**. You can change any wording, reassign a line to another
speaker, reorder or remove lines and scenes, and switch the voice. After it has
been made, **Edit script** reopens the editor so you can change it and narrate or
render again. Rendering a whiteboard or motion video again redraws its artwork.

### Instructions

Each spoken card has an **Instructions** panel with two parts:

- **Tell the script writer** is free text added to the script prompt, for
  example "Narrate in Spanish", "Explain it for a non-technical audience", or
  "Don't mention pricing". It shapes newly written scripts and never overrides
  the grounding rules.
- **Always replace** is a list of terms and what to say instead, such as
  `MCS → Copilot Studio`. Leave the replacement blank to remove a term. The
  model is asked to avoid these terms, and the list is then enforced on the
  finished script and again right before speech, so it also applies to anything
  typed into the editor. Matching is whole-word and case-insensitive.

**Save as notebook default** stores both parts on the notebook, so every spoken
card in that notebook starts with them. Each script also keeps its own copy,
editable in the script editor.

A narration voice speaks the language its text is written in, so a translation
instruction works best with a multilingual voice.

### Background music

Every spoken card has a **Music** picker: *No music*, *Random track* or a
specific track, with a **Quiet**, **Medium** or **Loud** volume. The track loops
to the length of the narration, fades in and out, and is lowered automatically
whenever someone speaks. ▶ previews the selected track.

Press **＋** to upload a track (MP3, M4A, AAC, WAV, OGG or FLAC, up to 50 MB)
into the notebook-wide music library under `.data/music`; ✕ deletes an uploaded
track. Tracks in the folder named by `MOTION_MUSIC_DIR`, if set, are listed too,
read-only. No music ships with the app. Only upload tracks you have the rights
to use.

Mixing uses the same Python and `imageio-ffmpeg` as the video renderers. If a
mix fails, the narration or video is kept without music and a note says so.

### Watermark

The three video cards (whiteboard, motion explainer and training video) and
their script editors have a **Mark** picker under the music picker: *No
watermark*, *Text* or *Image*.

- **Text** stamps up to 80 characters, such as `© Contoso Learning`, in white
  with a dark outline so it reads on any background.
- **Image** stamps a picture from the watermark library. Press **＋** to upload
  a PNG, JPEG, WebP or GIF (up to 5 MB); it is converted to PNG in the browser,
  keeping transparency, and saved to the shared library under
  `.data/watermarks`. ✕ deletes the selected image.

Pick one of nine **positions** on the 3 × 3 grid (corners, edges or center), a
**size** (*Small*, *Medium* or *Large*, relative to the frame) and an
**opacity** (*Faint*, *Medium* or *Solid*). The default is medium, bottom right.

The watermark is stamped onto the finished MP4 after any music is mixed, so
changing it means rendering again. It uses the same Python, Pillow and
`imageio-ffmpeg` as the renderers. If stamping fails, or the chosen image has
been deleted, the video is kept without the watermark and a note says so. Only
upload images you have the rights to use.

## Study aids

The quiz and flashcard generators share two controls, set on their cards in the
Studio panel before generating.

**Level** changes what is tested, not just the wording. *Easy* tests recall of
stated facts and figures. *Medium* tests understanding — why something follows,
what a figure implies. *Hard* tests precise distinctions, caveats and the
relationships between separate parts of the sources. Every level is still bound
by the same rule as the rest of the app: the answer must be determined by the
excerpts, never by outside knowledge.

**Length** is a range rather than an exact count — 5–6, 10–12 or 18–20 questions;
10–12, 18–22 or 30–35 cards. Demanding an exact number invites padding, which is
the one thing a study aid must not do.

### Quiz

Multiple choice, answered in place, scored on submission, with a cited
explanation under every question. After scoring you can **retry just the ones
you missed** — the rest of the record is kept, so the score you are improving on
stays meaningful.

Answer positions are **shuffled server-side**. This is not decoration: a
generated six-question quiz put the correct answer at option A *every time*,
despite the prompt asking explicitly for varied positions. That quiz is scorable
without reading it. Shuffling on the server is deterministic where the
instruction was not, and it shuffles positions rather than values so repeated
choices cannot mislocate the answer.

### Flashcards

A two-sided deck built for recall rather than reading. The front is a single
cue — a term, a name, a date, a short question. The back is the shortest
complete answer, with its citation.

- **Flip** by clicking the card or pressing <kbd>Space</kbd>
- **Self-grade** with *Got it* / *Missed it* (<kbd>2</kbd> / <kbd>1</kbd>)
- **Skip** or step back with <kbd>←</kbd> and <kbd>→</kbd>
- **Shuffle** at any point, or **Browse all** to read the deck as a list
- At the end, **review only the cards you missed**

Progress is kept in `localStorage`, keyed by deck, so closing the artifact and
reopening it resumes where you were. It is deliberately not stored in the
database: study progress is personal and disposable, and re-drilling a deck
should never rewrite the generated content. Clearing site data clears progress.

The generator enforces the shape a flashcard needs — one idea per card, no
answer leaking into the front, no restating the front on the back — and
near-duplicate cues are dropped, because models drift into repeats on long decks.

## Mind maps

Mind maps open **fully collapsed**, showing only the central topic with a badge
counting its subtopics. Clicking a node expands it one level; clicking again
collapses it along with everything beneath, so re-opening a branch starts tidy
rather than restoring a sprawl. **Expand all** and **Collapse all** are there
when you want the whole picture at once.

The layout is computed over only the visible nodes and refits after every
change, so the map always stays in view, and nodes glide between positions
instead of jumping. Branches are color-coded from the root, nodes carry their
source note as a tooltip, and the whole tree is keyboard reachable with proper
`aria-expanded` state.

## PowerPoint deck

The **PowerPoint deck** generator creates a presentation from the selected
sources: title slide, agenda, content slides, speaker notes and an app-appended
sources slide. Generate it from Studio like any written format; the focus box
narrows the deck topic. Deck length follows the same short, standard or long
slide-count ranges when a length is supplied.

Decks support four visual themes in the generated content: **Midnight**
(default), **Light**, **Ocean** and **Sunset**. Slide text is kept citation-free
for readability, while speaker notes preserve citation markers so you can click
through to evidence in the artifact view.

Open the generated artifact to preview slides, move with the arrow keys, review
speaker notes and download a real **PPTX** file. The exported deck keeps the
theme colors and speaker notes.

## Exporting

| Artifact | Formats |
|---|---|
| Audio overview | **MP3**, Markdown transcript |
| PowerPoint deck | **PPTX**, Markdown |
| Infographic | **PNG**, Markdown |
| Mind map | **PNG**, Markdown outline |
| Flashcards | **CSV** (Anki/Quizlet), Markdown table |
| Everything else | Markdown |

PNG export rasterises the artifact at 2× for a sharp image. The AI image style
is downloaded from the server instead of being captured from the screen, since
capturing it would resample the original through whatever width the window
happens to be. CSV is written with a BOM so Excel does not mangle accented
characters, and citation markers are stripped — they are internal navigation,
not part of a flashcard.
