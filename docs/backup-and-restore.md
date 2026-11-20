# Backup and restore

Everything the app stores lives in one folder: `DATA_DIR`, or `.data` next to
the app when `DATA_DIR` is not set. **Backup** on the home page downloads that
folder's contents as a single ZIP, and **Restore** puts them back, on the same
machine or a new one.

## What a backup contains

- A consistent snapshot of the database (notebooks, sources and their indexed
  text and embeddings, chats, notes, artifacts, transformations). It is taken
  with SQLite's `VACUUM INTO`, so you can keep working while it runs and the copy
  is never half-written.
- Every other file under the data folder: uploaded sources, generated audio,
  images and videos, and the shared libraries (music, watermarks, voice
  previews, AI video clips, intro and outro clips, caches).
- `manifest.json`, first in the archive: the backup format and schema version,
  the app version, when it was made, row counts and the list of files.

A backup never contains secrets. Anything whose top-level name starts with a dot
(`.env`, `.env.local`, restore staging, earlier pre-restore copies), files named
`secrets*`, partial downloads (`*.part`, `*.tmp`), SQLite sidecar files, and the
`restore-inbox` folder are left out. Provider keys live in your environment (or
Container App secrets), not in the data folder, so they are not part of a backup
and need to be configured again on a new machine.

## Download a backup

Home page, **Backup**, **Download backup (.zip)**. The file is named
`infiniaibook-backup-YYYYMMDD-HHMMSS.zip`. The archive is streamed, so a library of
many gigabytes needs no extra memory or temporary disk space. The same download
is available to scripts:

```bash
curl -OJ http://127.0.0.1:3100/api/backup
```

(With a password set, send `Authorization: Bearer $INFINIAIBOOK_API_TOKEN`; see
[Getting started](getting-started.md#password-protection).)

## Restore a backup

Restoring replaces **everything** on the server with the backup. It happens in
two steps so nothing changes by accident:

1. **Check.** Choose a backup (**Backup**, **Choose a backup (.zip)**). The app
   uploads it and verifies the archive without changing anything. It shows when
   the backup was made, its app version and what it holds (notebooks, sources,
   generated items, media files).
2. **Replace.** Tick *I understand this replaces all notebooks, sources,
   generated items and media on this server*, then **Replace my data with this
   backup**. The button stays disabled until you tick the box.

During the replace step the app extracts every file next to your live data,
checks each one against its recorded size and CRC-32, runs `PRAGMA
integrity_check` on the restored database, and only then swaps it in. The swap is
a set of same-volume renames; if any step fails, everything is moved back and
your data is exactly as it was.

When it succeeds, your previous data is kept in a hidden folder named
`.pre-restore-YYYYMMDD-HHMMSS` inside the data folder, and the window tells you
where. It uses disk space until you delete it, and it is excluded from later
backups. Hidden files in the data folder (such as `.env`) are left untouched.

Restore while nothing is generating: a video render that is still running keeps
writing to the old files.

### Backups larger than 200 MB

The browser upload goes through the app's request proxy, which buffers bodies up
to 200 MB. For larger archives, copy the ZIP onto the server into a folder named
`restore-inbox` inside the data folder (for Docker, that is `/data/restore-inbox`),
then reopen the Backup window: the file is listed with a **Check** button, and the
rest of the flow is the same. No upload is involved, so the size is limited only by
disk space.

### What is refused

A backup is rejected before anything is replaced when:

- it is not a ZIP, is cut short, or its central directory is damaged;
- it has no `manifest.json` or no database, is not an InfiniAIBook backup, or lists
  files that are not in the archive;
- it was made by a newer schema or format than this app understands (update the
  app first; older backups are upgraded by the usual additive migrations when the
  database opens);
- an entry's path is unsafe: absolute paths, `..` segments, backslashes, drive
  letters, `:` (Windows alternate data streams), control characters, duplicate
  names, reserved names (hidden entries, `infiniaibook.db-wal`), or paths outside
  `data/` and `db/` (zip-slip);
- an entry is a symbolic link, is encrypted, or uses an unsupported compression
  method;
- a file inflates past the size the archive declares (a decompression bomb), or fails its
  checksum;
- the restored database fails its integrity check;
- there is not enough free disk space, or the unpacked size is over
  `BACKUP_MAX_RESTORE_BYTES`.

## Settings

| Variable | Meaning |
|---|---|
| `DATA_DIR` | The folder that is backed up and restored (default `.data`) |
| `BACKUP_MAX_RESTORE_BYTES` | Largest unpacked size a restore accepts (default 50 GiB) |

## REST API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/backup` | Streams the backup ZIP (`application/zip`, `Content-Disposition: attachment`) |
| GET | `/api/backup/restore` | `{ inbox: [{ name, bytes, modified }], inboxPath, inboxName, maxUploadBytes }` for archives waiting in `restore-inbox` |
| POST | `/api/backup/restore` | Step 1. Body is the raw ZIP (`Content-Type: application/zip`, up to 200 MB) or JSON `{ "inbox": "file.zip" }`. Returns `{ token, summary }` and changes nothing |
| POST | `/api/backup/restore/{token}` | Step 2. `{ "confirm": "replace" }` extracts, verifies and swaps. Returns `{ restored, summary, previousFolder }` |
| DELETE | `/api/backup/restore/{token}` | Discard a checked backup. Unconfirmed ones are also swept after 24 hours |

## Archive layout

```
manifest.json            format, versions, counts and the file list
db/infiniaibook.db       database snapshot
data/<path>              every other file, at its path under the data folder
```

The archive is a standard ZIP (deflate, or stored for media that is already
compressed, with ZIP64 for archives or files over 4 GB), so any unzip tool can
open it.
