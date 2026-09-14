// Edge Function: screen a post's photos before it can go live.
//
// Every post is inserted with status 'hidden' (enforced by a DB trigger); this
// function is the only automated path to 'live'. Per photo, Claude classifies
// garden-relevance and safety. Outcomes:
//   approved  -> all photos clean and on-topic -> post goes live
//   rejected  -> hard safety flag -> photo deleted from storage, post stays hidden
//   review    -> uncertain (not clearly a garden, minors present, parse failure,
//                or no ANTHROPIC_API_KEY configured) -> stays hidden for a moderator
// Fail-safe: any error leaves the post hidden. Secrets:
//   supabase secrets set ANTHROPIC_API_KEY=...            (required for auto-approval)
//   supabase secrets set MODERATION_MODEL=claude-haiku-4-5  (optional cost lever)
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = Deno.env.get("MODERATION_MODEL") ?? "claude-opus-5";

const SCREEN_PROMPT = `You are the content-safety screener for Milkweed, a public garden-photo feed.
On-topic photos include: gardens, plants, yards, meadows and prairies, landscapes,
street-side and public plantings (boulevards, hellstrips, traffic circles, bioswales,
curb-cut rain basins, community gardens), planting beds, seed trays, garden tools,
and site prep (tarps, mulch, dug basins). People working or standing in such scenes
are fine and do not make a photo off-topic.
Analyze the image and respond with ONLY a JSON object, no prose, no code fences:
{"garden": boolean,       // true if the image plausibly fits the on-topic list above
 "sexual": boolean,       // any sexual or sexualized content
 "minors": boolean,       // any child is a prominent subject of the photo
 "violence": boolean,     // gore, violence, weapons, or shock content
 "unsafe_other": boolean, // other content that is HARMFUL or OFFENSIVE (hate symbols,
                          // drugs, dangerous acts). Merely off-topic is NOT unsafe —
                          // for that, set garden=false and leave this false.
 "reason": "one short sentence"}
Be strict on the safety categories when in doubt; be generous on garden relevance.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MEDIA: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const { post_id } = await req.json();
  if (!post_id) return json({ error: "post_id required" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: post } = await sb.from("post").select("id, status").eq("id", post_id).maybeSingle();
  if (!post) return json({ error: "post not found" }, 404);
  if (post.status !== "hidden") return json({ status: post.status });

  const { data: photos } = await sb.from("post_photo")
    .select("id, storage_path, scan_status").eq("post_id", post_id);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (key) {
    const anthropic = new Anthropic({ apiKey: key });
    for (const ph of (photos ?? []).filter((p) => p.scan_status === "pending")) {
      let verdict: Record<string, unknown> | null = null;
      let refused = false;
      try {
        const { data: blob, error } = await sb.storage.from("photos").download(ph.storage_path);
        if (error || !blob) throw error ?? new Error("download failed");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const ext = ph.storage_path.split(".").pop()?.toLowerCase() ?? "jpg";
        const resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1000,
          system: SCREEN_PROMPT,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: MEDIA[ext] ?? "image/jpeg", data: btoa(bin) } },
              { type: "text", text: "Classify this image per the system instructions. JSON only." },
            ],
          }],
        });
        refused = resp.stop_reason === "refusal";
        if (!refused) {
          const text = resp.content.find((b) => b.type === "text")?.text ?? "";
          verdict = JSON.parse(text.replace(/^```(json)?|```$/gm, "").trim());
        }
      } catch (e) {
        console.error("scan", ph.id, e);
      }

      // A refusal from the safety classifier is itself a strong negative signal.
      const hard = refused || (verdict && (verdict.sexual || verdict.violence || verdict.unsafe_other));
      const clean = verdict && verdict.garden && !verdict.minors && !hard;
      const status = clean ? "approved" : hard ? "rejected" : "review";
      await sb.from("post_photo").update({
        scan_status: status,
        scan_labels: verdict ?? { error: refused ? "model_refusal" : "unscannable" },
        scanned_at: new Date().toISOString(),
      }).eq("id", ph.id);
      // Never keep rejected bytes in a public bucket.
      if (status === "rejected") await sb.storage.from("photos").remove([ph.storage_path]);
    }
  }

  const { data: after } = await sb.from("post_photo").select("scan_status").eq("post_id", post_id);
  const states = (after ?? []).map((p) => p.scan_status);
  if (states.every((s) => s === "approved")) { // includes the text-only, zero-photo case
    await sb.from("post").update({ status: "live" }).eq("id", post_id);
    return json({ status: "live" });
  }
  return json({ status: states.includes("rejected") ? "rejected" : "pending" });
});
