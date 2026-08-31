import { requireAdmin } from "@/lib/admin/guard";
import { DELETION_LOG_PAGE, listDeletions } from "@/lib/admin/deletion-log";

/**
 * US-K2 — le journal des suppressions.
 *
 * La page `/admin` le rend côté serveur, en lisant `listDeletions` directement : cette
 * route sert les rechargements venus du navigateur, quand une suppression vient d'être
 * faite depuis le tableau de modération.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    return Response.json(await listDeletions(DELETION_LOG_PAGE));
  } catch (error) {
    console.error("GET /api/admin/deletions", error);
    return Response.json({ error: "Le journal n'a pas pu être chargé." }, { status: 500 });
  }
}
