// Portrait generation for user-designed companions. Thin fetch wrapper over
// OpenAI's Images API — same "no SDK, one call" shape as coinbase.ts /
// elevenlabs.ts / anam.ts. Throws a clear "not configured" error until
// OPENAI_API_KEY is set.
//
// Every prompt is wrapped so the model produces a wholly fictional person:
// no real individual, no celebrity likeness, no minors, fully clothed.
// OpenAI's own image moderation is the second layer.
import { ENV } from "./_core/env";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

const PROMPT_WRAPPER = (body: string) =>
  `Photorealistic portrait photograph of a completely fictional adult woman — an invented person who does not resemble any real individual, public figure, or celebrity. ${body}. Upper body, looking toward the camera, natural expression, soft natural light, shallow depth of field, tasteful and fully clothed. No text, no watermark.`;

/** Returns a data: URL (PNG) for a freshly generated fictional portrait. */
export async function generateCompanionPortrait(look: string): Promise<string> {
  if (!ENV.openaiApiKey) throw new Error("Companion design is not configured — set OPENAI_API_KEY");
  const response = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: PROMPT_WRAPPER(look),
      size: "1024x1536",
      quality: "medium",
      n: 1,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Portrait generation failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const json: any = await response.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 !== "string") throw new Error("Image API returned an unexpected response shape");
  return `data:image/png;base64,${b64}`;
}
