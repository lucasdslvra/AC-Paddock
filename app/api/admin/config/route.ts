import { readAdminConfig, writeMaxModFileMo } from "@/lib/admin/config";
import { requireAdmin } from "@/lib/admin/guard";
import {
  MAX_MOD_FILE_MO,
  MIN_MOD_FILE_MO,
  parseModFileMo,
  type ApiAdminConfig,
} from "@/lib/admin/settings";

/** US-K3 — les réglages courants, pour le formulaire de l'espace admin. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const config: ApiAdminConfig = await readAdminConfig();
    return Response.json(config);
  } catch (error) {
    console.error("GET /api/admin/config", error);
    return Response.json({ error: "Les réglages n'ont pas pu être chargés." }, { status: 500 });
  }
}

/**
 * US-K3 — modification de la taille maximale d'un upload.
 *
 * PATCH plutôt que PUT : le corps ne porte que les clés qu'on change, et il n'y en a
 * qu'une aujourd'hui. Une clé de plus s'ajoutera sans que ce contrat bouge.
 */
export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const { maxModFileMo } = payload as Record<string, unknown>;

  if (maxModFileMo === undefined) {
    return Response.json({ error: "Aucun réglage à modifier." }, { status: 400 });
  }

  const parsed = parseModFileMo(maxModFileMo);
  if (parsed === null) {
    return Response.json(
      {
        error: "Formulaire invalide.",
        fieldErrors: {
          maxModFileMo: `Choisis un entier entre ${MIN_MOD_FILE_MO} et ${MAX_MOD_FILE_MO} Mo.`,
        },
      },
      { status: 400 },
    );
  }

  try {
    await writeMaxModFileMo(parsed, guard.actor.id);
    // On relit plutôt que de renvoyer ce qu'on vient d'écrire : la date et l'auteur
    // affichés sous le curseur viennent de la ligne, pas de la requête.
    const config: ApiAdminConfig = await readAdminConfig();
    return Response.json(config);
  } catch (error) {
    console.error("PATCH /api/admin/config", error);
    return Response.json({ error: "Le réglage n'a pas pu être enregistré." }, { status: 500 });
  }
}
