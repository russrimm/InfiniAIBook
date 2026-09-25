# Notes, sessions and search

## Chat sessions

The bar above the chat lists every conversation in the notebook. **＋ New**
starts a fresh one (created on its first question and named after it), ✎
renames and 🗑 deletes. Follow-up context only comes from the session you are
in, so an unrelated question in a new session is not coloured by an old thread.
Chat history from before sessions existed is kept as "Earlier conversation".

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
own. Results are grounded and cited like everything else.

## Search and Ask

**🔎 Search** (home page and notebook header) searches every notebook at once.
*Keyword* ranking needs no model; *Semantic* blends embedding similarity the way
chat retrieval does and falls back to keywords if embeddings are unavailable.
Notes are matched too. **✨ Ask** returns one grounded answer drawn from the
best passages across the whole library, citing the notebook each came from.
From inside a notebook you can tick *Only this notebook* to narrow it.

## Reusing sources across notebooks

**📚 Library** in the Sources panel lists sources from your other notebooks.
Picked ones are copied with their text, summary and embeddings, so nothing is
fetched or embedded again and the copy is independent afterwards.
