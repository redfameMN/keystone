// Edge Function: screen a post's photos before it can go live.
//
// Every post is inserted with status 'hidden' (enforced by a DB trigger); this
// function is the only automated path to 'live'. Per photo, Claude classifies
// garden-relevance and safety. Outcomes:
//   approved  -> all photos clean and on-topic -> post goes live
//   rejected  -> hard safety flag -> photo deleted from storage, post stays hidden
//   review    -> uncertain (not clearly a garden, minors present, parse failure,
//                or no ANTHROPIC_API_KEY configured) -> stays hidden for a moderator
//   legal_hold-> suspected child sexual content: image MOVED to the private
//                quarantine bucket (preserved, not deleted) + operator incident
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

CHILD SAFETY IS THE TOP PRIORITY. Report the presence of any minor and, separately,
any nudity or sexualization, accurately and conservatively — when unsure whether a
person is a minor or whether content is sexualized, answer true.

Analyze the image and respond with ONLY a JSON object, no prose, no code fences:
{"garden": boolean,       // true if the image plausibly fits the on-topic list above
 "minors": boolean,       // any person who appears to be under 18 is present
 "nudity": boolean,       // nudity or partial nudity / underwear / swimwear-as-focus
 "sexual": boolean,       // any sexual or sexualized content or posing
 "violence": boolean,     // gore, violence, weapons, or shock content
 "unsafe_other": boolean, // other HARMFUL or OFFENSIVE content (hate symbols, drugs,
                          // dangerous acts). Merely off-topic is NOT unsafe — for
                          // that, set garden=false and leave this false.
 "reason": "one short sentence"}
Be strict on every safety category when in doubt; be generous only on garden relevance.`;

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
      let bytes: Uint8Array | null = null;
      const ext = ph.storage_path.split(".").pop()?.toLowerCase() ?? "jpg";
      try {
        const { data: blob, error } = await sb.storage.from("photos").download(ph.storage_path);
        if (error || !blob) throw error ?? new Error("download failed");
        bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
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

      // Top priority: a minor together with any nudity/sexual signal is treated as
      // suspected CSAM — PRESERVE (never delete) and pull from public view.
      const suspectedCsam = !!verdict && verdict.minors && (verdict.sexual || verdict.nudity);
      // Other hard fails (adult): reject and delete. A refusal is a strong negative
      // signal but we can't tell if a minor is involved, so hold for review (preserve).
      const hard = !suspectedCsam && !!verdict && (verdict.sexual || verdict.nudity || verdict.violence || verdict.unsafe_other);
      const clean = !!verdict && verdict.garden && !verdict.minors && !hard && !suspectedCsam;
      const status = suspectedCsam ? "legal_hold" : clean ? "approved" : hard ? "rejected" : "review";

      await sb.from("post_photo").update({
        scan_status: status,
        scan_labels: verdict ?? { error: refused ? "model_refusal" : "unscannable" },
        scanned_at: new Date().toISOString(),
      }).eq("id", ph.id);

      if (status === "legal_hold") {
        // Preserve as evidence in the PRIVATE quarantine bucket, then remove from
        // the public bucket, then log an incident for the operator (NCMEC report).
        try {
          if (bytes) await sb.storage.from("quarantine").upload(ph.storage_path, bytes, { contentType: MEDIA[ext] ?? "image/jpeg", upsert: true });
          await sb.storage.from("photos").remove([ph.storage_path]);
          const { data: pRow } = await sb.from("post").select("author_id").eq("id", post_id).maybeSingle();
          await sb.from("safety_incident").insert({
            post_id, author_id: pRow?.author_id ?? null, storage_path: ph.storage_path, labels: verdict,
          });
        } catch (e) {
          console.error("legal_hold handling failed", ph.id, e);
        }
      } else if (status === "rejected") {
        await sb.storage.from("photos").remove([ph.storage_path]); // never keep rejected bytes public
      }
    }
  }

  const { data: after } = await sb.from("post_photo").select("scan_status").eq("post_id", post_id);
  const states = (after ?? []).map((p) => p.scan_status);
  if (states.every((s) => s === "approved")) { // includes the text-only, zero-photo case
    await sb.from("post").update({ status: "live" }).eq("id", post_id);
    return json({ status: "live" });
  }
  // legal_hold surfaces to the poster only as a generic rejection (no detail).
  const blocked = states.includes("rejected") || states.includes("legal_hold");
  return json({ status: blocked ? "rejected" : "pending" });
});
