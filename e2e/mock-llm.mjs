// A stand-in OpenAI-compatible vision model for the end-to-end tests, so the
// real /api/screen-help route runs without a provider or any cost.
import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT || 3124);
let last = null;

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method === "GET" && req.url === "/last") return send(res, 200, last ?? {});
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      return send(res, 404, { error: { message: "not found" } });
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      const user = body.messages.at(-1);
      const parts = Array.isArray(user.content) ? user.content : [{ type: "text", text: user.content }];
      const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      const image = parts.find((p) => p.type === "image_url");

      // The vision probe: bill like a model that saw the image.
      if (text === "Reply OK.") {
        return send(res, 200, {
          choices: [{ message: { role: "assistant", content: "OK" } }],
          usage: { prompt_tokens: image ? 100 : 8 },
        });
      }

      last = {
        model: body.model,
        jsonMode: body.response_format?.type === "json_object",
        system: body.messages[0]?.role === "system" ? body.messages[0].content.slice(0, 60) : null,
        roles: body.messages.map((m) => m.role),
        hasImage: Boolean(image?.image_url?.url?.startsWith("data:image/jpeg;base64,")),
        detail: image?.image_url?.detail ?? null,
        prompt: text,
      };
      const reply = {
        status: "next_step",
        say: "I can see an editor. The **Share** button is at the top right.",
        step: "Click Share at the top right.",
        target: { x: 1100, y: 12, w: 160, h: 40, label: "Share" },
      };
      return send(res, 200, {
        choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify(reply) + "\n```" } }],
        usage: { prompt_tokens: 1500 },
      });
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock LLM on http://127.0.0.1:${PORT}`));
