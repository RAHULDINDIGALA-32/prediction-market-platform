"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Github, ExternalLink, Zap } from "lucide-react";

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

type FooterSection = {
  title: string;
  links: FooterLink[];
};

const footerSections: FooterSection[] = [
  {
    title: "Platform",
    links: [
      { label: "Markets", href: "/" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "Settlement", href: "/settlement" },
      { label: "Oracle", href: "/oracle" },
    ],
  },
  {
    title: "Developer",
    links: [
      {
        label: "Source Code",
        href: "https://github.com/RAHULDINDIGALA-32/0x01-markets",
        external: true,
      },
      {
        label: "Documentation",
        href: "https://github.com/RAHULDINDIGALA-32/0x01-markets#readme",
        external: true,
      },
      {
        label: "Smart Contracts",
        href: "https://github.com/RAHULDINDIGALA-32/0x01-markets/tree/main/foundry",
        external: true,
      },
      {
        label: "API Reference",
        href: "https://github.com/RAHULDINDIGALA-32/0x01-markets/issues",
        external: true,
      },
    ],
  },
  {
    title: "Resources",
    links: [
      {
        label: "License",
        href: "https://github.com/RAHULDINDIGALA-32/0x01-markets/blob/main/LICENSE",
        external: true,
      },
      {
        label: "Security",
        href: "https://github.com/RAHULDINDIGALA-32/0x01-markets/security",
        external: true,
      },
      {
        label: "Issues",
        href: "https://github.com/RAHULDINDIGALA-32/0x01-markets/issues",
        external: true,
      },
      {
        label: "Discussions",
        href: "https://github.com/RAHULDINDIGALA-32/0x01-markets/discussions",
        external: true,
      },
    ],
  },
];

const socialLinks = [
  {
    label: "GitHub",
    href: "https://github.com/RAHULDINDIGALA-32",
    icon: Github,
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto max-w-6xl px-3 py-12 sm:px-0">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand Section */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-700 p-2 dark:from-zinc-50 dark:to-zinc-300">
                  <div className="relative h-11 w-11">
                                  <Image
                                    src="/logo.png"
                                    alt="0x01 Markets Logo"
                                    fill
                                    className="rounded-full object-contain"
                                    priority
                                  />
                                </div>
                </div>
                <h3 className="font-mono text-sm font-semibold tracking-tight">
                  0x01 Markets
                </h3>
              </div>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              On-chain binary prediction markets with optimistic oracle.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                    title={link.label}
                    aria-label={link.label}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Footer Links Sections */}
          {footerSections.map((section) => (
            <div key={section.title} className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-900 dark:text-zinc-50">
                {section.title}
              </h4>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors"
                    >
                      {link.label}
                      {link.external && (
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="my-8 border-t border-zinc-200 dark:border-zinc-800" />

        {/* Bottom Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Copyright & Status */}
          <div className="space-y-2">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              © 2026 0x01 Markets. Built with{" "}
              <span className="inline-flex items-center gap-1">
                <Zap className="h-3 w-3" /> precision engineering.
              </span>
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Made by{" "}
              <a
                href="https://github.com/RAHULDINDIGALA-32"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Rahul Dindigala
              </a>
            </p>
          </div>

          {/* Tech Stack Badge */}
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Production Grade
              </span>
            </div>
          </div>
        </div>

        {/* Developer Info */}
        <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-900 dark:text-zinc-50">
            Developer
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            This platform is a production-ready smart contract application demonstrating advanced on-chain binary markets with optimistic oracle mechanics. All code is open-source and available on GitHub.
          </p>
        </div>
      </div>
    </footer>
  );
}
