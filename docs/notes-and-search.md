# Notes, sessions and search

## Chat sessions

The bar above the chat lists every conversation in the notebook. **＋ New**
starts a fresh one (created on its first question and named after it), ✎
renames it in place (Enter saves, Escape cancels) and 🗑 deletes. Follow-up context only comes from the session you are
in, so an unrelated question in a new session is not colored by an old thread.
Chat history from before sessions existed is kept as "Earlier conversation".
⤓ downloads the whole chat as a Markdown file: your questions as quotes, each
answer with a **Sources** list naming the source, part and the start of the
excerpt behind every `[n]` marker.

## Message actions

- **📋 Copy** under any message copies it as Markdown. An answer keeps its `[n]`
  markers and gains a **Sources** list, so the claims stay traceable. A brief
  "✓ Copied" confirms it.
- **↻ Regenerate** on the latest answer asks the same question again and
  replaces the answer; if the new one fails, the old one stays. **Stop** keeps
  the partial new answer as before.
- **✎ Edit** on your own message (shown on hover, or on focus) opens it for
  editing. **Send** asks you to confirm when later messages exist, because they
  are discarded and the chat is re-answered from that point.
- After a cited answer, up to three **follow-up questions** appear as buttons;
  clicking one sends it. They come from one small extra model call per fresh
  answer, are never made when you reopen a chat, and are skipped silently if
  the call fails or the daily budget is spent.

## Find in this chat

The **🔍** button next to **＋ New** (or **Find in this chat** in the command palette) opens a
search bar over the conversation as it is shown. It counts the matches ("3 of 12"),
marks them all, and scrolls the current one into view. Enter goes to the next match,
Shift+Enter to the previous, the **↑ / ↓** buttons do the same, and Escape closes the bar
and puts focus back in the question box. Matching ignores case and looks at what is on the
page (answers, your questions and citation text, not the Copy and Regenerate buttons); a
phrase that is split by formatting, such as half in bold, is not found as one match. The
matches are marked with the browser's CSS Custom Highlight API, so nothing in the chat
changes; browsers without it select the current match instead.

## Command palette

**Ctrl+K** (**Cmd+K** on a Mac) opens a searchable list from anywhere in a notebook, even
while you are typing in a field. Type a few words; every word must match. It lists:

- **Actions:** ask a question, find in this chat, add or choose sources, go to Studio or
  Notes, search all notebooks, export, choose the model, switch theme, screen helper, help.
- **Studio:** every format by name; choosing one opens the Studio and puts focus on its
  **Generate** button. It never starts a generation by itself.
- **Sources:** each source in the notebook; choosing one opens it in the reader.
- **Shortcuts:** the keyboard shortcuts, which open the full list.

Up and Down move through the results, Home and End jump to the ends, Enter runs the choice
and Escape closes the palette and returns focus to where you were. It is a combobox with a
listbox: a screen reader hears how many results there are and the option that is current
while focus stays in the field. It will not open on top of another dialog. The same command
is in the **⋯ More** menu as **Command palette**.

## Notes

The right-hand column switches between **Studio** and **Notes** (on phones,
Notes has its own tab). A note is Markdown you write yourself, or model output
you chose to keep:

- **🗒️ Save to notes** under any chat answer keeps it, citations included.
- **Apply → note** in a source's reader runs a transformation on that source.
- **➕ Add as source** copies a note into the notebook's sources, so chat and
  the Studio can draw on it. The copy does not change if you edit the note.

## Transformations

A transformation is a named prompt applied to one source at a time. Eight
ship built in — Dense summary, Key insights, Analyze paper, Explain simply,
Table of contents, Reflection questions, Glossary and Action items — and
**⚙ Transformations** in the Notes panel lets you add, edit and delete your
own. To run one, open a source and choose it under **Transform**; the result is
saved as a note. Results are grounded and cited like everything else.

## Search and Ask

**🔎 Search** (home page and notebook header) searches every notebook at once.
*Keyword* ranking needs no model; *Semantic* blends embedding similarity the way
chat retrieval does and falls back to keywords if embeddings are unavailable.
Notes are matched too. **✨ Ask** returns one grounded answer drawn from the
best passages across the whole library, citing the notebook each came from.
From inside a notebook you can tick *Only this notebook* to narrow it.

## Reusing sources across notebooks

**📚 From other notebooks** in the Sources panel lists sources from your other notebooks.
Picked ones are copied with their text, summary and embeddings, so nothing is
fetched or embedded again and the copy is independent afterwards.
