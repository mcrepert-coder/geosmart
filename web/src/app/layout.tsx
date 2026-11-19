import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-sora",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: "GeoSmart Field · Mesurer juste. Enregistrer une seule fois.",
    template: "%s · GeoSmart Field",
  },
  description:
    "Annonces immobilieres rattachees a des parcelles levees au centimetre (RTK). Statut juridique et certification visibles. Ne vaut pas titre foncier.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${sora.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="gs-root min-h-full flex flex-col">
        <a className="gs-skip" href="#contenu">
          Aller au contenu
        </a>
        <div id="contenu" className="flex flex-1 flex-col" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}