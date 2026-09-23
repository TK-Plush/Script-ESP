import "./globals.css";

export const metadata = {
  title: "CineForge AI — Free Forever AI Movie & Video Studio",
  description:
    "Turn your ideas into real movies. Smart AI screenwriter + Seedance video generation (all versions) — unlimited, no credits, free forever.",
  metadataBase: new URL("https://cineforge-ai.vercel.app"),
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}