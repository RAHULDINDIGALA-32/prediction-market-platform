"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import AdminNavLink from "./AdminNavLink";

type Props = {
  children: React.ReactNode;
};

const routes = [
  { href: "/", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/settlement", label: "Settlement" },
  { href: "/oracle", label: "Oracle" },
  { href: "/admin/create-market", label: "Create Market", adminOnly: true },
];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function NavBar({ children }: Props) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-900">
              PM
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Prediction Markets
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                On-chain binary markets with optimistic oracle
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 text-sm font-medium sm:flex">
            {routes.map((route) => {
              if (route.adminOnly) {
                return null; // Will be handled by AdminNavLink
              }
              const isActive =
                route.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(route.href);
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className={classNames(
                    "rounded-full px-3 py-1.5 transition-colors",
                    isActive
                      ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  )}
                >
                  {route.label}
                </Link>
              );
            })}
            {routes
              .filter((r) => r.adminOnly)
              .map((route) => (
                <AdminNavLink key={route.href} href={route.href} label={route.label} />
              ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-xs text-zinc-500 sm:block">
            </div>
            <ConnectButton
              showBalance={false}
              accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}


