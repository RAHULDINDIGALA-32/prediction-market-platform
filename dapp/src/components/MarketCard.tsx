"use client";

import React from "react";
import Link from "next/link";
import TradeForm from "./TradeForm";

type Props = {
  market: {
    id: string;
    status: string;
    collateral: any;
    contractAddress?: string;
    createdAt: Date;
  };
};

export default function MarketCard({ market }: Props) {
  const collateral = String(market.collateral);

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-100 px-4 py-3 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-900">
        Market #{market.id}
      </div>

      <div className="grid gap-6 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:px-6 md:py-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                LMSR Binary Market
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                YES / NO outcome market settled via optimistic oracle and on-chain settlement engine.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              {market.status}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs text-zinc-600 dark:text-zinc-300 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Collateral
              </dt>
              <dd className="mt-0.5 font-medium">
                {collateral}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Contract
              </dt>
              <dd className="mt-0.5 break-all font-mono text-[11px] text-zinc-700 dark:text-zinc-200">
                {market.contractAddress ?? "Not registered"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Created
              </dt>
              <dd className="mt-0.5">
                {market.createdAt.toLocaleDateString()}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <Link
              href={`/?market=${encodeURIComponent(market.id)}`}
              className="inline-flex items-center rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Trade market
            </Link>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Uses signed off-chain quotes executed via `executeTrade` on the market contract.
            </span>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-900 md:border-t-0 md:border-l md:pl-4">
          <TradeForm initialMarketId={market.id} compact />
        </div>
      </div>
    </article>
  );
}
