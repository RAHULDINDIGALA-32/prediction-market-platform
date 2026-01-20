import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {WalletProviders} from "@/components/WalletProviders";
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
  title: "0x01 Markets",
  description: "On-chain binary markets with optimistic oracle",
  applicationName: "0x01 Markets",
  creator: "Rahul Dindigala",
  authors: [
    {
      name: "Rahul Dindigala",
      url: "https://github.com/RAHULDINDIGALA-32",
    },
  ],

   other: {
    "developer:sourceCode": "https://github.com/RAHULDINDIGALA-32/0x01-markets",
  },

 
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
