import AppShell from "@/components/AppShell";
import OraclePanel from "@/components/roles/OraclePanel";

export default function OraclePage() {
  return (
    <AppShell>
      <section className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Oracle & Resolution
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Propose and dispute outcomes for expired markets using the optimistic
          oracle. Only authorized resolvers can resolve disputes, but anyone can
          propose outcomes and post bonds according to the configured parameters.
        </p>
      </section>

      <OraclePanel />
    </AppShell>
  );
}


