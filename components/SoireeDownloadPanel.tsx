"use client";

import { useCallback, useState } from "react";
import type { ModType } from "@/lib/generated/prisma/enums";

/** Un mod retenu, réduit à ce qu'il faut pour aller le chercher. */
export interface SoireeDownloadItem {
  modId: string;
  name: string;
  type: ModType;
  /**
   * Le fichier déposé sur le bucket, s'il y en a un **et** qu'il n'a pas expiré (cahier
   * §2.7 : 24 h après le dépôt). `null` sinon — la fiche n'a alors que son lien externe,
   * et c'est à la main que ça se récupère.
   */
  file: { filename: string; href: string } | null;
  /** Le lien externe de la fiche (RaceDepartment, Drive…), toujours présent. */
  href: string;
}

/** Le temps entre deux téléchargements lancés. */
const STEP_MS = 800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Le retrait des mods retenus, pendant la fenêtre qui s'ouvre à la fermeture du vote
 * (`isDownloadOpen`) : un bouton, et les 8 véhicules + le circuit partent l'un après
 * l'autre.
 *
 * Les fichiers ne transitent pas par l'application, pas plus au retrait qu'au dépôt :
 * `Mod.fileUrl` est l'URL publique de l'objet sur Cloudflare R2, et le navigateur va la
 * chercher directement. Une archive à faire par le serveur aurait fait passer neuf
 * fichiers — jusqu'à 1 Go pièce — par une fonction Vercel qui plafonne bien en dessous,
 * en temps comme en volume, pour un budget d'hébergement nul (cahier §1). Le « d'un
 * coup » se joue donc côté navigateur : neuf téléchargements enchaînés, pas une archive.
 *
 * D'où l'espacement entre deux clics : lancés dans la même boucle, les navigateurs n'en
 * retiennent qu'un. Et d'où l'avertissement — au deuxième fichier, le navigateur demande
 * l'autorisation de télécharger plusieurs fichiers. Sans la phrase, un refus distrait
 * ressemblerait à une panne du bouton.
 *
 * Les mods sans fichier disponible ne sont pas passés sous silence : ils sont listés
 * avec leur lien externe. Une soirée où trois voitures sur huit n'ont pas été déposées
 * doit se voir avant le départ, pas se découvrir au moment de rouler.
 */
export function SoireeDownloadPanel({
  items,
  closesAtLabel,
}: {
  items: SoireeDownloadItem[];
  /** L'heure de fermeture du retrait, « 23:00 » — deux heures après le départ. */
  closesAtLabel: string;
}) {
  const [started, setStarted] = useState<number | null>(null);

  const files = items.filter((item) => item.file !== null);
  const missing = items.filter((item) => item.file === null);

  const downloadAll = useCallback(async () => {
    for (const [index, item] of files.entries()) {
      if (!item.file) continue;
      setStarted(index + 1);

      // Un lien cliqué, pas un `window.open` : le second onglet serait bloqué comme une
      // fenêtre surgissante, alors qu'une archive servie en `application/zip` se
      // télécharge sans quitter la page. L'attribut `download` est ignoré hors de notre
      // domaine — c'est le dernier segment de la clé R2 qui donne le nom du fichier, et
      // c'est justement le nom d'origine (`buildModFileKey`).
      const anchor = document.createElement("a");
      anchor.href = item.file.href;
      anchor.download = item.file.filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      await sleep(STEP_MS);
    }
  }, [files]);

  return (
    <div
      className="rounded-sm border p-[15px]"
      style={{ borderColor: "var(--color-amber)", background: "var(--color-surface)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
          RETRAIT DES MODS
        </div>
        <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
          jusqu&apos;à {closesAtLabel}
        </div>
      </div>

      <p className="mt-2 font-mono text-[10.5px] leading-[1.7] text-[var(--color-text-secondary)]">
        Le vote est clos : voici ce que la soirée a retenu. Les fichiers partent l&apos;un
        après l&apos;autre — ton navigateur demandera l&apos;autorisation d&apos;en
        télécharger plusieurs.
      </p>

      <button
        type="button"
        onClick={() => void downloadAll()}
        disabled={files.length === 0}
        className="btn-solid mt-3 w-full rounded-sm p-3 font-sans text-sm font-semibold disabled:opacity-40"
        style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
      >
        {files.length === 0
          ? "Aucun fichier déposé"
          : `↓ Télécharger les ${files.length} fichier${files.length > 1 ? "s" : ""}`}
      </button>

      {started !== null && (
        <p
          role="status"
          className="mt-2 text-center font-mono text-[10px] text-[var(--color-text-muted)]"
        >
          {started} / {files.length} lancé{started > 1 ? "s" : ""}
          {started === files.length && " · vérifie tes téléchargements"}
        </p>
      )}

      {missing.length > 0 && (
        <div className="mt-3 border-t border-[var(--color-border-hairline)] pt-[10px]">
          <div className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--color-text-muted)]">
            SANS FICHIER — À PRENDRE AU LIEN
          </div>
          <ul className="mt-[6px] flex flex-col gap-[5px]">
            {missing.map((item) => (
              <li key={item.modId} className="font-mono text-[10.5px] leading-[1.5]">
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="link-underline text-[var(--color-text-secondary)]"
                >
                  {item.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
