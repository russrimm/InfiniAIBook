# Study aids, mind maps and exporting

Infographics, audio overviews and whiteboard videos have their own pages:
[Infographic styles](infographics.md), [Audio overviews](audio-overviews.md)
and [Whiteboard videos](whiteboard-videos.md).

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
instead of jumping. Branches are colour-coded from the root, nodes carry their
source note as a tooltip, and the whole tree is keyboard reachable with proper
`aria-expanded` state.

## Exporting

| Artifact | Formats |
|---|---|
| Audio overview | **MP3**, Markdown transcript |
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
