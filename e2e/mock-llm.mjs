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

      const system = body.messages[0]?.role === "system" ? String(body.messages[0].content) : "";
      const reply = (obj) =>
        send(res, 200, {
          choices: [{ message: { role: "assistant", content: JSON.stringify(obj) } }],
          usage: { prompt_tokens: 900 },
        });

      // Infographic style suggestions.
      if (system.startsWith("You choose infographic formats")) {
        last = { kind: "suggest", system: system.slice(0, 60) };
        return reply({
          suggestions: [
            { style: "timeline", reason: "The sources follow the pilot month by month" },
            { style: "funnel", reason: "Survey to weekly volunteers narrows step by step" },
            { style: "not-a-style", reason: "ignored" },
            { style: "myths", reason: "The notes correct common worries" },
          ],
        });
      }

      // An infographic brief, carrying every layout's fields so any style renders.
      if (system.includes("Design a visual infographic")) {
        last = { kind: "infographic", system };
        return reply({
          title: "Garden pilot at a glance [1]",
          subtitle: "What the mock sources say",
          stats: [{ value: "24", label: "Beds", caption: "Built in spring [1]" }],
          sections: [{ heading: "Plan", icon: "🌱", bullets: ["Build 24 beds [1]"] }],
          takeaway: "Steady volunteers matter most [1].",
          milestones: [
            { date: "Mar", title: "Workshops", detail: "Volunteers join [1]." },
            { date: "Apr", title: "Build day", detail: "Beds go up [1]." },
            { date: "Sep", title: "Harvest", detail: "Review the season [1]." },
          ],
          levels: [
            { label: "Surveyed", detail: "Everyone asked [1].", value: "210" },
            { label: "Weekly", detail: "Committed helpers [1].", value: "12" },
          ],
          myths: [{ myth: "Nobody wants it", fact: "Most residents do [1]." }],
          pros: ["Saves water [1]"],
          cons: ["Costs money [1]"],
          terms: [{ term: "Drip line", definition: "Slow watering tube [1]." }],
          flow: ["Plant", "Water", "Harvest"],
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
      const vision = {
        status: "next_step",
        say: "I can see an editor. The **Share** button is at the top right.",
        step: "Click Share at the top right.",
        target: { x: 1100, y: 12, w: 160, h: 40, label: "Share" },
      };
      return send(res, 200, {
        choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify(vision) + "\n```" } }],
        usage: { prompt_tokens: 1500 },
      });
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock LLM on http://127.0.0.1:${PORT}`));
