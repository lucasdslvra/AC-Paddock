import { auth } from "@/auth";
import { readAdminConfig } from "@/lib/admin/config";
import { listDeletions } from "@/lib/admin/deletion-log";
import { readGuildAccess } from "@/lib/admin/guilds";
import { listAdminMembers } from "@/lib/admin/members";
import { sessionGuildId } from "@/lib/session-user";
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
  // Le serveur de l'admin qui regarde : le panneau ACCÈS le marque, et le formulaire de
  // création de soirée le propose par défaut. Le contrôle de rôle, lui, est dans le
  // layout.
  const viewerGuildId = await sessionGuildId(await auth());

  const [mods, tags, deletions, config, members, access] = await Promise.all([
    listModerationMods(),
    listModerationTags(),
    listDeletions(),
    readAdminConfig(),
    listAdminMembers(),
    readGuildAccess(viewerGuildId),
  ]);

  return (
    <AdminView
      mods={mods}
      tags={tags}
      deletions={deletions}
      config={config}
      members={members}
      access={access}
    />
  );
}
