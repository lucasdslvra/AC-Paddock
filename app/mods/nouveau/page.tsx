"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BreadcrumbHeader } from "@/components/BreadcrumbHeader";
import { TagPill } from "@/components/TagPill";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { currentSession, mods, type ModType } from "@/lib/mock-data";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function NouveauModPage() {
  const { session, isLoading } = useRequireAuth();
  const [type, setType] = useState<ModType>("vehicule");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [addedTags, setAddedTags] = useState<string[]>([]);

  const similarMods = useMemo(() => {
    const query = name.trim().toLowerCase();
    if (query.length < 3) return [];
    return mods.filter((mod) => mod.name.toLowerCase().includes(query)).slice(0, 3);
  }, [name]);

  const matchingUrlMod = useMemo(() => {
    const query = url.trim().toLowerCase();
    if (query.length < 6) return undefined;
    return mods.find((mod) => mod.primaryLink && query.includes(mod.primaryLink.url.toLowerCase()));
  }, [url]);

  const tagQuery = tagInput.trim().toLowerCase();
  const allTagNames = useMemo(() => Array.from(new Set(mods.flatMap((mod) => mod.tags))), []);
  const matchingTag = tagQuery ? allTagNames.find((tag) => tag.includes(tagQuery)) : undefined;

  if (isLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <BreadcrumbHeader
        crumbs={[{ label: "Catalogue", href: "/catalogue" }, { label: "Nouvelle fiche" }]}
        actions={
          <>
            <Link href="/catalogue" className="rounded-sm border border-[var(--color-border-strong)] px-[13px] py-2 font-sans text-xs font-medium">
              Annuler
            </Link>
            <span
              className="rounded-sm px-[14px] py-2 font-sans text-xs font-semibold"
              style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
            >
              Publier la fiche
            </span>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-[18px] p-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-[18px] rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              TYPE — OBLIGATOIRE
            </div>
            <div className="mt-2 flex gap-[7px]">
              {(["vehicule", "circuit"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className="rounded-sm px-[18px] py-[10px] font-sans text-[13px] font-semibold"
                  style={
                    type === option
                      ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                      : { border: "1px solid var(--color-border-strong)", color: "var(--color-text-secondary)" }
                  }
                >
                  {option === "vehicule" ? "Véhicule" : "Circuit"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                NOM DU MOD — OBLIGATOIRE
              </div>
              {similarMods.length > 0 && (
                <div className="font-mono text-[10px] text-[var(--color-link)]">
                  {similarMods.length} fiche{similarMods.length > 1 ? "s" : ""} proche{similarMods.length > 1 ? "s" : ""} trouvée{similarMods.length > 1 ? "s" : ""}
                </div>
              )}
            </div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="ex. Silvia S15 Rocket Bunny"
              className="mt-2 w-full rounded-sm border bg-white px-[13px] py-[11px] font-sans text-sm text-[#17181c] outline-none"
              style={{ borderColor: similarMods.length > 0 ? "var(--color-ink)" : "var(--color-border-strong)" }}
            />
            {similarMods.length > 0 && (
              <div className="rounded-b-sm border border-t-0 border-[var(--color-border-strong)] bg-white">
                <div className="border-b border-[var(--color-border-hairline)] px-[13px] py-[7px] font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  DÉJÀ DANS LE CATALOGUE ?
                </div>
                {similarMods.map((mod) => (
                  <div key={mod.id} className="flex items-center gap-[11px] border-b border-[var(--color-border-hairline)] px-[13px] py-[9px] last:border-b-0">
                    <div
                      className="h-[34px] w-[34px] flex-none rounded-sm"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 4px, var(--color-placeholder-b) 4px 8px)",
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-sans text-[13px] font-semibold text-[#17181c]">{mod.name}</div>
                      <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {mod.type === "vehicule" ? "véhicule" : "circuit"} · {mod.tags.join(", ")} · {mod.totalVotes} votes
                      </div>
                    </div>
                    <Link href={`/mods/${mod.id}`} className="rounded-sm bg-[var(--color-ink)] px-[10px] py-[6px] font-sans text-[11px] font-medium text-[var(--color-surface)]">
                      Voir la fiche
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              LIEN EXTERNE — CHAMP PRINCIPAL
            </div>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.racedepartment.com/downloads/…"
              className="mt-2 w-full rounded-sm border bg-white px-[13px] py-[11px] font-mono text-xs text-[#17181c] outline-none"
              style={{ borderColor: matchingUrlMod ? "var(--color-danger)" : "var(--color-border-strong)" }}
            />
            {matchingUrlMod && (
              <div
                className="mt-2 flex gap-[11px] rounded-sm border p-3"
                style={{ borderColor: "var(--color-border-strong)", borderLeft: "3px solid var(--color-danger)", background: "rgba(255,255,255,.6)" }}
              >
                <div className="flex-1">
                  <div className="font-sans text-[13px] font-semibold text-[#17181c]">
                    Ce lien est déjà sur une fiche
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-secondary)]">
                    Après nettoyage des paramètres de suivi, l&apos;URL correspond à{" "}
                    <span className="text-[#17181c]">{matchingUrlMod.name}</span>. Si c&apos;est bien le
                    même mod, complète la fiche existante plutôt que d&apos;en créer une seconde : les
                    votes et les tags resteront regroupés.
                  </div>
                </div>
                <div className="flex flex-none flex-col justify-center gap-[6px]">
                  <Link
                    href={`/mods/${matchingUrlMod.id}`}
                    className="whitespace-nowrap rounded-sm bg-[var(--color-ink)] px-[11px] py-[7px] text-center font-sans text-[11px] font-semibold text-[var(--color-surface)]"
                  >
                    Voir la fiche existante
                  </Link>
                  <button
                    type="button"
                    onClick={() => setUrl("")}
                    className="whitespace-nowrap rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[7px] font-sans text-[11px] font-medium"
                  >
                    Créer quand même
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              DESCRIPTION — OPTIONNELLE
            </div>
            <textarea
              placeholder="Ce qu'il faut savoir avant de l'installer : version, pack de textures requis, physique…"
              className="mt-2 h-[62px] w-full rounded-sm border border-[var(--color-border-strong)] bg-white px-[13px] py-[11px] font-sans text-xs text-[#17181c] outline-none placeholder:text-[var(--color-text-faint)]"
            />
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              TAGS — OPTIONNELS
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-[6px] rounded-t-sm border border-[var(--color-border-strong)] bg-white px-[11px] py-[9px]">
              {addedTags.map((tag) => (
                <TagPill
                  key={tag}
                  label={tag}
                  active
                  removable
                  onClick={() => setAddedTags((current) => current.filter((t) => t !== tag))}
                />
              ))}
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && tagInput.trim()) {
                    event.preventDefault();
                    const value = matchingTag ?? tagInput.trim();
                    setAddedTags((current) => (current.includes(value) ? current : [...current, value]));
                    setTagInput("");
                  }
                }}
                placeholder="ajouter un tag"
                className="min-w-[100px] flex-1 bg-transparent font-mono text-xs text-[#4b5158] outline-none placeholder:text-[var(--color-text-faint)]"
              />
            </div>
            {tagQuery && (
              <div className="rounded-b-sm border border-t-0 border-[var(--color-border-strong)] bg-white">
                {matchingTag && (
                  <div className="flex justify-between border-b border-[var(--color-border-hairline)] px-3 py-2">
                    <span className="font-mono text-[11px]">{matchingTag}</span>
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)]">existant</span>
                  </div>
                )}
                <div className="flex justify-between px-3 py-2">
                  <span className="font-mono text-[11px]">« {tagInput.trim()} » — créer ce tag</span>
                  <span className="font-mono text-[10px] text-[var(--color-link)]">entrée</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              IMAGE D&apos;APERÇU — OPTIONNELLE
            </div>
            <div
              className="mt-[9px] flex h-24 items-center justify-center rounded-sm border border-dashed border-[var(--color-border-dashed)] font-mono text-[10px] text-[var(--color-text-muted)]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 6px, var(--color-placeholder-b) 6px 12px)",
              }}
            >
              glisse une image ici
            </div>
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                FICHIER DU MOD — OPTIONNEL
              </span>
              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">max 100 Mo</span>
            </div>
            <div className="mt-[9px] rounded-sm border border-dashed border-[var(--color-border-dashed)] p-3.5 text-center">
              <div className="font-sans text-xs font-semibold">Déposer le .zip</div>
              <div className="mt-[5px] font-mono text-[9.5px] leading-[1.6] text-[var(--color-text-muted)]">
                .zip, .rar, .7z
              </div>
            </div>
            <div className="mt-[11px] flex gap-2 rounded-sm bg-[var(--color-border-hairline)] p-[10px]">
              <span className="font-mono text-[10px] text-[var(--color-link)]">⚠</span>
              <span className="font-mono text-[10px] leading-[1.6] text-[var(--color-text-secondary)]">
                Supprimé automatiquement 24 h après l&apos;upload. Pour une soirée dans une semaine,
                mets juste le lien et tu ré-uploaderas le jour J.
              </span>
            </div>
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              ENGAGER DIRECTEMENT
            </div>
            <div className="mt-[10px] flex items-center justify-between">
              <div>
                <div className="font-sans text-xs font-semibold">Soirée du 4 sept</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  thème : {currentSession.theme}
                </div>
              </div>
              <ToggleSwitch on />
            </div>
          </div>

          <div className="px-1 font-mono text-[10px] leading-[1.6] text-[var(--color-text-muted)]">
            Tu publies sous ton pseudo Discord ({session?.user?.name ?? "…"}). N&apos;importe qui
            pourra ensuite compléter la fiche ; seuls toi et les admins pourrez la supprimer.
          </div>
        </div>
      </div>
    </div>
  );
}
