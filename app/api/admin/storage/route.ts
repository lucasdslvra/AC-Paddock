import { requireAdmin } from "@/lib/admin/guard";
import { purgeAllModFiles } from "@/lib/mods/purge-files";
import { readStorageUsage } from "@/lib/mods/storage-quota";

/** US-H1 — l'occupation courante du bucket, pour rafraîchir la jauge après un vidage. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    return Response.json(await readStorageUsage());
  } catch (error) {
    console.error("GET /api/admin/storage", error);
    return Response.json({ error: "Le bucket n'a pas pu être interrogé." }, { status: 502 });
  }
}

/**
 * US-K1 — vidage forcé du bucket Cloudflare, réservé aux admins.
 *
 * Irréversible : les objets partent, et les fiches qui les référençaient sont remises à
 * zéro. Les fiches elles-mêmes ne sont pas touchées — c'est la même promesse que pour
 * l'expiration ordinaire (cahier §2.7). L'interface demande confirmation avant
 * d'appeler ; ici on ne fait que constater le droit, la route ne se protège pas d'un
 * clic distrait, ce n'est pas son rôle.
 *
 * Pas de journalisation dans `DeletionLog` : ce journal raconte les suppressions de
 * *contenu* (fiche, tag, soirée) et ne connaît pas d'autre cible. La trace du vidage va
 * là où l'espace admin la lit déjà — l'horodatage du dernier nettoyage.
 */
export async function DELETE() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const result = await purgeAllModFiles();
    console.warn(
      `Vidage du bucket par ${guard.actor.username} : ${result.deleted}/${result.found} objets retirés, ${result.cleared} fiche(s) remise(s) à zéro.`,
    );

    // L'occupation d'après, pour que l'appelant redessine sa jauge sans second appel.
    return Response.json({ ...result, usage: await readStorageUsage() });
  } catch (error) {
    console.error("DELETE /api/admin/storage", error);
    return Response.json({ error: "Le bucket n'a pas pu être vidé." }, { status: 500 });
  }
}
