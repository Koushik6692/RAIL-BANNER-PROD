import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Figtree, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const figtreeHeading = Figtree({ subsets: ["latin"], variable: "--font-heading" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree-sans" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter-sans" });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Rail Banner Studio",
    template: "%s | Rail Banner Studio",
  },
  description: "Team shelf-rail banner editor with shared projects and export history.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        geistMono.variable,
        figtree.variable,
        inter.variable,
        figtreeHeading.variable,
        "font-sans",
      )}
    >
      <head />
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
