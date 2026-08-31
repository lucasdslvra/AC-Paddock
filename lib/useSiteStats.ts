"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import type { SiteStats } from "@/lib/stats";

/**
 * Les compteurs du site pour un composant client — l'en-tête du catalogue.
 *
 * Même forme que `useIsAdmin` : la session ne les porte pas, il faut les demander à
 * `GET /api/stats`. `null` tant que la réponse n'est pas là, et en cas d'échec : trois
 * nombres décoratifs ne valent pas un message d'erreur, l'en-tête affiche un tiret et
 * la page continue.
 *
 * `import type` et non `import` : `lib/stats.ts` est marqué `server-only`, seul le
 * type traverse — il disparaît à la compilation.
 */
export function useSiteStats(): SiteStats | null {
  const { status } = useSession();
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();
    fetch("/api/stats", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: SiteStats | null) => body && setStats(body))
      .catch(() => {});

    return () => controller.abort();
  }, [status]);

  return stats;
}
