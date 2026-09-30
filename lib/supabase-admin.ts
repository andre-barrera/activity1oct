import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "photos";

let cachedClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.");
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

export async function deletePhoto(path: string | null | undefined) {
  if (!path) return;
  const { error } = await supabaseAdmin().storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.error("No se pudo eliminar la foto", error);
}
