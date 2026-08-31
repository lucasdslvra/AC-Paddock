import { readAdminConfig } from "@/lib/admin/config";
import { listDeletions } from "@/lib/admin/deletion-log";
import { listModerationMods, listModerationTags } from "@/lib/admin/moderation";
import { AdminView } from "./AdminView";

/**
 * US-K1 à US-K3 — l'espace admin.
 *
 * Page serveur : tout ce qu'elle affiche se lit en base, et rien n'a besoin d'être
 * redemandé au navigateur au premier rendu. Les panneaux qui écrivent (suppression,
 * réglage d'upload) sont des composants clients qui rappellent `router.refresh()` :
 * c'est cette page qui recharge, donc le tableau, le journal et les compteurs restent
 * d'accord entre eux après chaque action.
 *
 * Le contrôle de rôle est dans `layout.tsx`, pas ici : il vaut pour toute la section.
 */
export default async function AdminPage() {
  const [mods, tags, deletions, config] = await Promise.all([
    listModerationMods(),
    listModerationTags(),
    listDeletions(),
    readAdminConfig(),
  ]);

  return <AdminView mods={mods} tags={tags} deletions={deletions} config={config} />;
}
