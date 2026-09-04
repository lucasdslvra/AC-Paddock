"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Vrai quand la fenêtre satisfait la media query passée.
 *
 * `useSyncExternalStore` et non un `useState` + `useEffect` : la largeur de la fenêtre
 * est exactement ce que ce hook décrit — un état qui vit hors de React et qui prévient
 * quand il change. React lit alors `matchMedia` au moment où il en a besoin, plutôt que
 * d'en recopier la valeur dans un état à recaler après coup.
 *
 * Le rendu serveur répond toujours `false` : il ne connaît pas la fenêtre, et une valeur
 * devinée ferait diverger l'hydratation. D'où la règle d'emploi : ce hook ne sert qu'à
 * ce que le CSS ne sait pas faire — la racine d'un `IntersectionObserver`, l'élément
 * qu'on ramène en haut. La mise en page, elle, reste aux points de rupture Tailwind,
 * qui n'attendent pas l'hydratation.
 */
export function useMediaQuery(query: string): boolean {
  const [subscribe, getSnapshot] = useMemo(() => {
    // `window` n'existe pas au rendu serveur : la liste n'est construite qu'à la
    // première lecture, qui n'a lieu que dans le navigateur.
    let media: MediaQueryList | undefined;
    const list = () => (media ??= window.matchMedia(query));

    return [
      (onStoreChange: () => void) => {
        const target = list();
        target.addEventListener("change", onStoreChange);
        return () => target.removeEventListener("change", onStoreChange);
      },
      () => list().matches,
    ] as const;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
