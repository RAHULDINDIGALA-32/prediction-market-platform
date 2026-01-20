"use client";

import { useAccount } from "wagmi";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props {
  href: string;
  label: string;
}

export default function AdminOnlyNavLink({ href, label }: Props) {
  const { address } = useAccount();
  const pathname = usePathname();
  const isActive = pathname === href;

  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS?.toLowerCase();
  if(!adminAddress) {
    return null;
  }

  const isAuthorized = address?.toLowerCase() === adminAddress;
  if (!isAuthorized) {
    return null;
  }

  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1.5 transition-colors text-sm font-medium",
        isActive
          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
      )}
    >
      {label}
    </Link>
  );
}
