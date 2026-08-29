import { sweepOrphanImages } from "@/lib/mods/orphan-images";

/**
 * Balayage des images orphelines du bucket. Déclenché par un cron (Vercel Cron envoie
 * un GET avec `Authorization: Bearer $CRON_SECRET`), ou à la main avec le même en-tête.
 */
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sans secret configuré la route resterait ouverte : on refuse de tourner.
    console.error("CRON_SECRET manquant — balayage des images orphelines désactivé.");
    return Response.json({ error: "Maintenance non configurée." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    return Response.json(await sweepOrphanImages());
  } catch (error) {
    console.error("Balayage des images orphelines", error);
    return Response.json({ error: "Le balayage a échoué." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
