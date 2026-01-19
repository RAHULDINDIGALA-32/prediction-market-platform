"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
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

  const { data: isAdmin } = useQuery({
    queryKey: ["isAdmin", address],
    queryFn: async () => {
      if (!address) return false;
      const res = await fetch(`/api/admin/check-creator?address=${address}`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.isAdmin;
    },
    enabled: !!address,
  });

  if (!isAdmin) {
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
