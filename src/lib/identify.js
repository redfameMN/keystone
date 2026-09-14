// Plant identification. In dev with a key in the box, the browser calls Plant.id
// directly. In production VITE_IDENTIFY_URL points at the Supabase Edge Function
// (supabase/functions/identify) so the API key never ships to clients.

const DEMO = [
  { name: "Solidago canadensis", common: "Canada goldenrod", prob: 0.71 },
  { name: "Symphyotrichum novae-angliae", common: "New England aster", prob: 0.18 },
  { name: "Helianthus maximiliani", common: "Maximilian sunflower", prob: 0.06 },
];

export async function identifyPhoto(base64, devKey) {
  const fn = import.meta.env.VITE_IDENTIFY_URL;
  if (fn) {
    const r = await fetch(fn, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: base64 }) });
    if (!r.ok) throw new Error(`identify ${r.status}`);
    return (await r.json()).suggestions;
  }
  if (!devKey) { await new Promise((r) => setTimeout(r, 700)); return DEMO; }
  const res = await fetch("https://plant.id/api/v3/identification?details=common_names", {
    method: "POST",
    headers: { "Api-Key": devKey, "Content-Type": "application/json" },
    body: JSON.stringify({ images: [base64], similar_images: false }),
  });
  if (!res.ok) throw new Error(`Plant.id ${res.status}`);
  const j = await res.json();
  return (j.result?.classification?.suggestions || []).slice(0, 3).map((x) => ({
    name: x.name,
    common: x.details?.common_names?.[0] ?? null,
    prob: x.probability,
  }));
}
