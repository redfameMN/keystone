// Edge Function: suggest which plants are in a garden photo, using Claude vision.
// Returns up to 3 suggestions [{ name, common, prob }] the composer shows for the
// user to confirm-to-tag. The Anthropic key stays server-side (never ships to
// clients). Reuses the same ANTHROPIC_API_KEY secret as scan-post.
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = Deno.env.get("IDENTIFY_MODEL") ?? Deno.env.get("MODERATION_MODEL") ?? "claude-opus-5";

// The app's native genus vocabulary — Claude prefers these when they match, so
// suggestions line up with taggable genera (see src/data/taxonomy.js).
const KNOWN = "Quercus, Prunus, Salix, Betula, Populus, Acer, Vaccinium, Solidago, Symphyotrichum, Helianthus, Rudbeckia, Eupatorium, Lupinus, Ceanothus, Arctostaphylos, Asclepias, Echinacea, Monarda, Liatris, Schizachyrium";

const PROMPT = `You identify plants in North American garden photos. Look at the image and
identify up to 3 distinct plants that are actually visible, most prominent first.
When a plant matches one of these genera, use that genus (it's the app's native
plant vocabulary): ${KNOWN}. Otherwise use your best botanical identification.

Respond with ONLY a JSON array, no prose, no code fences:
[{"name": "Genus species" or "Genus", "common": "common name", "prob": 0.0-1.0}]
"prob" is your confidence. Report only plants you can actually see; return [] if
there are no identifiable plants.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MEDIA: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const { image, media_type } = await req.json();
  if (!image) return json({ error: "image (base64) required" }, 400);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ suggestions: [] }); // no key → no suggestions (composer falls back to manual tagging)

  try {
    const anthropic = new Anthropic({ apiKey: key });
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: MEDIA[media_type ?? "jpg"] ?? "image/jpeg", data: image } },
          { type: "text", text: "Identify the plants. JSON array only." },
        ],
      }],
    });
    if (resp.stop_reason === "refusal") return json({ suggestions: [] });
    const text = resp.content.find((b) => b.type === "text")?.text ?? "[]";
    const arr = JSON.parse(text.replace(/^```(json)?|```$/gm, "").trim());
    const suggestions = (Array.isArray(arr) ? arr : []).slice(0, 3)
      .filter((s) => s && typeof s.name === "string")
      .map((s) => ({ name: s.name, common: s.common ?? null, prob: typeof s.prob === "number" ? s.prob : 0.5 }));
    return json({ suggestions });
  } catch (e) {
    console.error("identify", e);
    return json({ error: "identify failed" }, 502);
  }
});
