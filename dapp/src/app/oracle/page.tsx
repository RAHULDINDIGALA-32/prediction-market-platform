import AppShell from "@/components/NavBar";
import OracleMarketsClient from "@/components/OracleMarketsClient";

export default function OraclePage() {
  return (
    <AppShell>
      <section className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Oracle & Resolution
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Participate in the oracle resolution process. Propose outcomes for closed markets,
          dispute proposed outcomes within the dispute window, or resolve disputes if you're an
          authorized resolver. Anyone can finalize undisputed outcomes after the dispute window closes.
        </p>
      </section>

      <OracleMarketsClient />
    </AppShell>
  );
}


