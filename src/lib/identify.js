// Plant identification. Calls the Supabase Edge Function (supabase/functions/identify),
// which uses Claude vision server-side so the API key never ships to clients. Without
// a backend (seed-data mode) it returns demo suggestions so the flow is still visible.
import { supabase } from "./supabase.js";

const DEMO = [
  { name: "Solidago canadensis", common: "Canada goldenrod", prob: 0.71 },
  { name: "Symphyotrichum novae-angliae", common: "New England aster", prob: 0.18 },
  { name: "Helianthus maximiliani", common: "Maximilian sunflower", prob: 0.06 },
];

export async function identifyPhoto(base64, mediaType = "jpg") {
  if (!supabase) { // seed-data mode, no backend
    await new Promise((r) => setTimeout(r, 700));
    return DEMO;
  }
  const { data, error } = await supabase.functions.invoke("identify", {
    body: { image: base64, media_type: mediaType },
  });
  if (error) throw new Error(error.message ?? "identify failed");
  return data?.suggestions ?? [];
}
