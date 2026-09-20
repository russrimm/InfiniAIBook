import { getClient, visionModel, describeAuthError } from "./ai";

/** Formats the vision endpoint accepts, keyed by extension. */
export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

export function imageMimeFor(name: string, declared?: string): string | null {
  if (declared && /^image\/(png|jpeg|jpg|webp|gif|bmp)$/i.test(declared)) {
    return declared.toLowerCase().replace("image/jpg", "image/jpeg");
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext] ?? null;
}

/**
 * Floor for "the image was actually in the request".
 *
 * Derived from the instruction rather than fixed, so editing the prompt above
 * cannot quietly push the real cost past a hard-coded number and start
 * refusing working models. Measured on this deployment: a blind model billed
 * 175 tokens for a 2.3 MB image, a vision model billed 1214.
 */
function minPromptTokens(): number {
  const instruction = Math.ceil(INSTRUCTION.length / 4);
  return Math.max(250, Math.round(instruction * 1.6));
}

export class ImageNotReadError extends Error {}

const INSTRUCTION = `You are describing an image so that its content can be searched and cited later.

Write a thorough description covering, where present:
- what the image is (photograph, diagram, chart, screenshot, scan, map, artwork)
- the subject and what is happening
- every piece of text you can read, transcribed exactly, including labels, axis
  titles, legends, captions and figures
- for charts: the type, what each axis measures, the series, and the values or
  trend
- for diagrams: the components and how they connect
- notable colours, layout and anything that carries meaning

Write plain prose and lists. Do not speculate about what is not visible, do not
guess at illegible text, and do not add context from outside the image. If part
of it is unclear, say so.`;

export type ImageDescription = {
  title: string;
  text: string;
  model: string;
  promptTokens: number;
};

/**
 * Describe an image with the vision model.
 *
 * A model without vision does not refuse the request — it ignores the image
 * and answers from the prompt alone. Measured on this deployment, DeepSeek-V4
 * took a 2.3 MB infographic, reported 20 prompt tokens, and confidently
 * described an entirely different picture. Indexing that would put invented
 * content into the notebook under a real filename, so the token count is
 * checked and a description that cannot have been derived from the image is
 * rejected rather than stored.
 */
export async function describeImage(
  bytes: Buffer,
  mime: string,
  filename: string
): Promise<ImageDescription> {
  const model = visionModel();
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

  let res;
  try {
    res = await getClient().chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCTION },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    const detail = describeAuthError(e) ?? (e instanceof Error ? e.message : "");
    if (status === 400) {
      throw new ImageNotReadError(
        `"${model}" rejected the image. It is probably not a vision model — choose one under Models → Image reading. ${detail}`
      );
    }
    throw e;
  }

  const promptTokens = res.usage?.prompt_tokens ?? 0;
  const text = (res.choices[0]?.message?.content ?? "").trim();

  if (promptTokens > 0 && promptTokens < minPromptTokens()) {
    throw new ImageNotReadError(
      `"${model}" did not actually read the image — the request billed only ${promptTokens} prompt tokens, so any description would be invented. Choose a vision-capable model under Models → Image reading.`
    );
  }
  if (!text) {
    throw new ImageNotReadError(`"${model}" returned no description for the image.`);
  }

  // The filename is often the only name the image has, and it is what the
  // person will look for in the source list.
  const title = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();

  return {
    title: title || "Image",
    text: `Image: ${filename}\n\n${text}`,
    model,
    promptTokens,
  };
}
