import { requestOrigin } from "@/lib/discord/notify";
import { sendVoteReminders } from "@/lib/soirees/vote-reminder";

/**
 * Le rappel « plus que 30 minutes pour voter » (lib/soirees/vote-reminder.ts).
 *
 * Déclenché toutes les 5 minutes par `pg_cron` sur Supabase, via `pg_net` (voir
 * prisma/cron/vote-reminders.sql) — Vercel Hobby n'autorise qu'un cron par jour, bien trop
 * lâche pour viser une demi-heure. Même contrat que les autres routes de maintenance :
 * `Authorization: Bearer $CRON_SECRET`, et refus de tourner sans secret configuré.
 *
 * Les liens du message partent de l'adresse par laquelle `pg_net` appelle : c'est
 * l'URL publique de l'application (`app_base_url` dans Vault).
 */
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sans secret configuré la route resterait ouverte : on refuse de tourner.
    console.error("CRON_SECRET manquant — rappels de vote désactivés.");
    return Response.json({ error: "Maintenance non configurée." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    return Response.json(await sendVoteReminders(requestOrigin(request)));
  } catch (error) {
    console.error("Rappels de vote", error);
    return Response.json({ error: "Le rappel a échoué." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
