import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
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
        <Script id="no-flash-theme" strategy="beforeInteractive">
          {NO_FLASH_THEME_SCRIPT}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
