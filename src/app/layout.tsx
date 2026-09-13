import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
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
  title: "nx-control-erp",
  description: "Gestão financeira, tesouraria e planejamento de caixa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="theme-a"
          themes={[
            "theme-a",
            "theme-a-dark",
            "theme-b",
            "theme-b-dark",
            "theme-c",
            "theme-c-dark",
          ]}
          enableSystem={false}
          disableTransitionOnChange
          storageKey="nx-tema"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
