import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// src/lib/db.ts creates DATA_DIR on import, so point it somewhere disposable
// before any test imports it. Never touch the developer's real .data/.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infiniaibook-test-"));
process.env.DATA_DIR = dir;
