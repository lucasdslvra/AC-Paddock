import { sweepExpiredModFiles } from "@/lib/mods/expired-files";

/**
 * US-H3 — expiration des fichiers de mod (cahier §2.7).
 *
 * Déclenchée toutes les heures par `pg_cron` sur Supabase, qui appelle cette route via
 * `pg_net` (voir prisma/sql/expired-mod-files-cron.sql). Même contrat que le balayage
 * des images orphelines : `Authorization: Bearer $CRON_SECRET`, et refus de tourner si
 * le secret n'est pas configuré.
 *
 * Le cahier §2.7 propose que `pg_net` s'adresse directement à l'API R2. Ce n'est pas ce
 * qui est fait ici : supprimer un objet R2 demande une signature AWS SigV4, donc une
 * chaîne de HMAC-SHA256 à écrire en plpgsql, et surtout les identifiants Cloudflare
 * recopiés dans la base. La base appelle donc l'application, qui a déjà le SDK et les
 * identifiants — `pg_cron` et `pg_net` restent l'un et l'autre à leur poste.
 */
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sans secret configuré la route resterait ouverte : on refuse de tourner.
    console.error("CRON_SECRET manquant — expiration des fichiers désactivée.");
    return Response.json({ error: "Maintenance non configurée." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    return Response.json(await sweepExpiredModFiles());
  } catch (error) {
    console.error("Expiration des fichiers de mod", error);
    return Response.json({ error: "Le balayage a échoué." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
