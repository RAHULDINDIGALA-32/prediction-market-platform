import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import WalletProviders from "@/components/WalletProviders";
import "@rainbow-me/rainbowkit/styles.css";
//import { initializeServices } from "@/lib/initializeServices";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prediction Markets",
  description: "On-chain binary markets with optimistic oracle",
};

// Initialize background services on app startup
// this approach may not work in serverless environments like Vercel, so we have switched to using UI triggered dataBase sync
//initializeServices().catch(console.error);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <WalletProviders>
          {children}
        </WalletProviders>
      </body>
    </html>
  );
}
