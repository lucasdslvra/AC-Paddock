import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var paramTheme = new URLSearchParams(location.search).get("theme");
    var theme = paramTheme === "dark" || paramTheme === "light" ? paramTheme : localStorage.getItem("paddock-theme");
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
})();
`;

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Paddock",
  description: "Wiki collaboratif de mods Assetto Corsa pour le groupe.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Les extensions de navigateur (ColorZilla & co.) ajoutent leurs attributs
          sur <body> avant l'hydratation : on ignore l'écart sur cet élément. */}
      <body className="min-h-full flex flex-col bg-grid" suppressHydrationWarning>
        {/* Le thème choisi est posé sur <html> pendant l'analyse du document, donc
            avant le premier rendu : sans ça, un membre en thème sombre verrait la page
            s'afficher en clair le temps que React s'hydrate.

            Un <script> nu, et non `next/script` : en `beforeInteractive`, un script
            en ligne n'est pas exécuté par le navigateur mais empilé dans la file du
            runtime Next, qui le joue après le premier rendu — trop tard pour ce qu'on
            cherche justement à éviter. React, lui, n'exécute jamais un <script> qu'il
            monte côté client : ici il ne fait que le rendre dans le HTML du serveur, et
            l'hydratation réutilise l'élément sans le recréer. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
