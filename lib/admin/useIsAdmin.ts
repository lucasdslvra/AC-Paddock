"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

/**
 * US-K1 — « lien visible admin uniquement ».
 *
 * Le rôle n'est pas dans la session (voir `GET /api/me`) : l'en-tête doit le demander.
 * La valeur de départ est `false`, donc le lien apparaît une fois la réponse revenue
 * plutôt que de clignoter chez les membres. Ce n'est de toute façon pas une protection
 * — la section `/admin` renvoie au catalogue quiconque n'est pas admin, et chaque
 * écriture repasse par `requireAdmin`.
 */
export function useIsAdmin(): boolean {
  const { status } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();
    fetch("/api/me", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { isAdmin?: boolean } | null) => setIsAdmin(body?.isAdmin === true))
      .catch(() => {});

    return () => controller.abort();
  }, [status]);

  // La déconnexion est lue de la session, pas remise à zéro depuis l'effet : remettre
  // l'état à `false` à la main y ferait une cascade de rendus, et la réponse gardée en
  // mémoire redeviendra la bonne si le même membre se reconnecte.
  return status === "authenticated" && isAdmin;
}
