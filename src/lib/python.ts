import { spawn } from "node:child_process";
import path from "node:path";

/** Run a renderer under scripts/ with a config file, rejecting with its stderr tail. */
export function runPythonRenderer(scriptPath: string[], configPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = path.join(process.cwd(), "scripts", ...scriptPath);
    const py = process.env.PYTHON_BIN || "python";
    const child = spawn(py, [script, configPath], { cwd: process.cwd() });

    let err = "";
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e) =>
      reject(
        new Error(
          `Could not start Python ("${py}"). The renderer needs Python with numpy, Pillow and imageio-ffmpeg. ${e.message}`
        )
      )
    );
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`The renderer failed (exit ${code}). ${err.slice(-400)}`))
    );
  });
}
