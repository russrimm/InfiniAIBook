# How grounding works

1. **Ingest** — text is extracted (`unpdf` for PDF, `mammoth` for DOCX, `jszip` for PPTX and
   ZIP archives, `cheerio` for HTML), normalized, and split into ~1400-character chunks with 200 characters
   of overlap on paragraph boundaries.
2. **Embed** — each chunk is embedded and stored as a `Float32Array` blob in SQLite.
3. **Retrieve** — queries are embedded and ranked by cosine similarity, blended
   with a lexical overlap score (85/15) so rare proper nouns are not lost. The
   lexical score matches Unicode words (so accented and non-Latin text counts)
   of three or more letters, plus two-letter acronyms like "AI" or "EU", at word
   starts. If the embedding call fails, retrieval degrades gracefully to
   keyword-only.
4. **Generate** — chat uses the top-k passages; studio generation uses an evenly
   spread sample across *every* selected source, so a report is not written from
   page one alone. Each selected source is guaranteed its opening passage first
   (shortened if many sources share the context budget), then the remaining
   budget is shared round-robin with passages spread through each document.
   With no source selected, saved-source chat and Studio refuse rather than
   falling back to all sources. The optional per-notebook **Use live Microsoft
   Learn in chat** setting is a chat-only exception: it retrieves fresh Learn
   passages alongside the selected saved sources, or by itself when none are
   selected. It never includes unselected saved documents. Training videos use
   only selected sources too; notebook notes are not automatically included.
5. **Cite** — passages are numbered in the prompt, the model emits `[n]` markers,
   and the UI resolves them back to source title, part number and the raw excerpt.
   Live Learn citations instead open the exact excerpt saved with the answer and
   a link to the original page. These snapshots survive history, saved notes and
   notebook export/import without becoming notebook sources; explicitly import
   pages to use them in Studio, discussions or library-wide Search/Ask.

Studio outputs are requested as JSON, then parsed defensively and normalized
(clamped answer indices, depth-limited mind-map trees, validated stat blocks) so a
malformed model response can never break the UI.

## Studio and Library boundaries

Every Studio generation request requires an explicit, nonempty `sourceIds` list.
All IDs must belong to the current notebook; missing selections and mixed
cross-notebook selections are rejected rather than expanded or silently filtered.
Artifacts save the selected IDs and citations from the actual input excerpts.
Focus, style instructions and editable scripts steer presentation, not evidence.
To include a note or a live web result, first add its content as a notebook source
and check it.

Training visual planning also receives the original selected-source excerpts.
Reused infographics must have verifiable provenance entirely within the video's
selection; the editor and API reject incompatible references. Screenshot lookup
uses only selected Microsoft Learn source pages, not a live search of other
articles. Generated illustrations are decorative, not evidence. User uploads
and manual edits are not automatically verified against the sources.

These checks enforce the input boundary, not a guarantee that a model cannot
hallucinate. Review important claims against their excerpts. Library items are
saved snapshots: changing a source or the current checkboxes does not rewrite
existing items. Generate a new item to reflect updated sources. Older artifacts
without verifiable provenance cannot be reused as grounded infographics or
replanned training visuals; existing saved media is not deleted or regenerated.

## Changing the embedding model

Embeddings from different models occupy unrelated vector spaces, so their
similarity scores are meaningless against each other. Worse, comparing them
returns a plausible-looking number rather than an error, which would quietly
reduce retrieval to noise with nothing to indicate why.

Every chunk therefore records the model and dimension it was embedded with.
Retrieval compares only vectors that match the current model, counts any that
do not, and reports the shortfall in chat:

> 12 of 40 passages were embedded with nomic-embed-text, not the current
> text-embedding-3-large, so they were ranked by keyword only. Re-embed this
> notebook to restore semantic search.

Those chunks still participate through keyword ranking, so answers degrade
rather than disappear. To repair a notebook:

```bash
# how many chunks are stale
curl localhost:3000/api/notebooks/<id>/reembed

# re-embed them with the current model
curl -X POST localhost:3000/api/notebooks/<id>/reembed
```

Databases created before this was added are migrated automatically: dimensions
are recovered from the stored blob, and the model is inferred from the
configured deployment, which is the only one that could have produced them.
