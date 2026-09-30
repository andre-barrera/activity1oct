import { PHOTO_BUCKET, supabaseAdmin } from "@/lib/supabase-admin";
import { PHOTO_CACHE_SECONDS, verifyPhotoToken } from "@/lib/photo-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get("path") || "";
    const expiresAt = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("sig") || "";

    if (!path || !path.startsWith("games/") || path.includes("..") || path.length > 300) {
      return new Response("No encontrada", { status: 404 });
    }
    if (!(await verifyPhotoToken(path, expiresAt, signature))) {
      return new Response("Enlace de foto expirado", { status: 401 });
    }

    const { data, error } = await supabaseAdmin().storage.from(PHOTO_BUCKET).download(path);
    if (error || !data) return new Response("No encontrada", { status: 404 });

    return new Response(data, {
      headers: {
        "content-type": data.type || "application/octet-stream",
        "cache-control": `private, max-age=${PHOTO_CACHE_SECONDS}, must-revalidate`,
        "x-content-type-options": "nosniff",
        "content-disposition": "inline",
      },
    });
  } catch (error) {
    console.error("photo", error);
    return new Response("No se pudo cargar la foto", { status: 503 });
  }
}
