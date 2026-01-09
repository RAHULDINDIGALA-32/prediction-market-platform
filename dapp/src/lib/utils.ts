import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatEth(value: bigint | string | number, decimals = 4): string {
  const num = typeof value === "bigint" ? Number(value) / 1e18 : Number(value);
  return `${num.toFixed(decimals)} ETH`;
}

export function formatTimeRemaining(endTime: Date | number): string {
  const now = Date.now();
  const end = typeof endTime === "number" ? endTime * 1000 : endTime.getTime();
  const diff = end - now;

  if (diff <= 0) return "Ended";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function calculateProbability(qYes: bigint | string, qNo: bigint | string): {
  yes: number;
  no: number;
} {
  const yes = typeof qYes === "bigint" ? Number(qYes) : Number(qYes);
  const no = typeof qNo === "bigint" ? Number(qNo) : Number(qNo);
  const total = yes + no;
  
  if (total === 0) {
    return { yes: 0.5, no: 0.5 };
  }
  
  return {
    yes: yes / total,
    no: no / total,
  };
}


