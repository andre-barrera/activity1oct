import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const code = (process.env.GAME_CODE || "").trim().toUpperCase();

if (!url || !key || !code) {
  console.error("Uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... GAME_CODE=ABC123 node scripts/purge-game.mjs");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const game = await supabase.from("games").select("id").eq("code", code).maybeSingle();
if (game.error) throw game.error;
if (!game.data) {
  console.log(`No existe la sala ${code}.`);
  process.exit(0);
}

const photos = await supabase.from("participants").select("photo_path").eq("game_id", game.data.id);
if (photos.error) throw photos.error;
const paths = (photos.data || []).map((row) => row.photo_path).filter(Boolean);
if (paths.length) {
  const removed = await supabase.storage.from("photos").remove(paths);
  if (removed.error) throw removed.error;
}

const deleted = await supabase.from("games").delete().eq("id", game.data.id);
if (deleted.error) throw deleted.error;
console.log(`Sala ${code} y ${paths.length} foto(s) eliminadas.`);
