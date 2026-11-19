import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DE RIDE | Intercity rides, with more certainty",
  description: "Explore verified park departures, transparent fares and available seats for intercity routes across Lagos and Ogun.",
  openGraph: {
    title: "DE RIDE | Move with confidence",
    description: "Find your park. Catch your ride. Get there with confidence.",
    images: ["https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1794927085562-Kifc0QDotO89kvkek32R7QrEWNaGvX.jpg"],
    type: "website",
  },
  applicationName: "DE RIDE",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
