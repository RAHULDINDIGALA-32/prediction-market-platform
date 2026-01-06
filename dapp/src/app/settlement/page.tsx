import AppShell from "@/components/AppShell";
import SettlementPanel from "@/components/roles/SettlementPanel";

export default function SettlementPage() {
  return (
    <AppShell>
      <section className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Settlement & Redemption
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Once markets have expired and the oracle has finalized an outcome, use
          the settlement engine to finalize markets and redeem winning outcome
          tokens for ETH.
        </p>
      </section>

      <SettlementPanel />
    </AppShell>
  );
}


