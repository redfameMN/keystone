// Edge Function: identify a garden photo with Plant.id and enrich each suggestion with
// genus / native-list / keystone status from our tables. Key: `supabase secrets set PLANT_ID_KEY=...`
// The client sends base64; we return suggestions only. Nothing is stored here.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const { image, ecoregion_id } = await req.json();
  if (!image) return Response.json({ error: "image (base64) required" }, { status: 400 });

  const r = await fetch("https://plant.id/api/v3/identification?details=common_names", {
    method: "POST",
    headers: { "Api-Key": Deno.env.get("PLANT_ID_KEY")!, "Content-Type": "application/json" },
    body: JSON.stringify({ images: [image], similar_images: false }),
  });
  if (!r.ok) return Response.json({ error: `Plant.id ${r.status}` }, { status: 502 });
  const j = await r.json();
  const raw = (j.result?.classification?.suggestions ?? []).slice(0, 3);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const suggestions = [];
  for (const s of raw) {
    const genus = s.name.split(" ")[0];
    const { data: g } = await sb.from("plant_genus").select("genus, common_name").eq("genus", genus).maybeSingle();
    const { data: k } = ecoregion_id
      ? await sb.from("keystone_genus").select("genus").eq("genus", genus).eq("ecoregion_id", ecoregion_id).maybeSingle()
      : { data: null };
    suggestions.push({
      name: s.name,
      common: s.details?.common_names?.[0] ?? g?.common_name ?? null,
      prob: s.probability,
      genus, in_native_list: !!g, keystone: !!k,
    });
  }
  return Response.json({ suggestions });
});
