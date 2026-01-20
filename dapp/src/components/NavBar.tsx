"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import CreatorNavLink from "./CreatorNavLink";
import AdminOnlyNavLink from "./AdminOnlyNavLink";

type Props = {
  children: React.ReactNode;
};

const routes = [
  { href: "/", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/settlement", label: "Settlement" },
  { href: "/oracle", label: "Oracle" },
  { href: "/admin/create-market", label: "Create Market", requiresCreator: true },
  { href: "/admin/management", label: "Trust Management", requiresAdmin: true },
];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function NavBar({ children }: Props) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto md:mx-10 lg:mx-20 flex max-w-6xl items-center justify-between px-3 py-3 sm:px-0">
          <Link href="/" className="text-lg font-bold ">
            <div className="flex items-center gap-3 ">
              {/* Logo */}
              <div className="relative h-11 w-11">
                <Image
                  src="/logo.png"
                  alt="0x01 Markets Logo"
                  fill
                  className="rounded-full object-contain"
                  priority
                />
              </div>

              {/* Name */}
              <div>
                <div className="text-sm font-semibold tracking-tight">
                  <span className="font-mono tabular-nums">0x01</span>{" "}
                  <span>Markets</span>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                On-chain Binary Markets
                </p>
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-3 text-sm font-medium sm:flex">
            {routes.map((route) => {
              if (route.requiresCreator || route.requiresAdmin) {
                return null; 
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
              .filter((r) => r.requiresCreator)
              .map((route) => (
                <CreatorNavLink key={route.href} href={route.href} label={route.label} />
              ))}
            {routes
              .filter((r) => r.requiresAdmin)
              .map((route) => (
                <AdminOnlyNavLink key={route.href} href={route.href} label={route.label} />
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
      
      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-3 py-8 sm:px-0">{children}</main>
    </div>
  );
}
