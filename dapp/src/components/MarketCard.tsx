"use client";
import React from "react";
import TradeForm from "./TradeForm";

export default function MarketCard({}: {}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-lg border bg-white p-6">
        <h2 className="text-2xl font-bold">Example Market</h2>
        <p className="mt-2 text-sm text-gray-600">Binary market: YES / NO — settle via optimistic oracle.</p>
      </div>

      <TradeForm />
    </div>
  );
}
