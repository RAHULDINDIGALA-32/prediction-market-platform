import AppShell from "@/components/NavBar";
import SettlementMarketsClient from "@/components/SettlementMarketsClient";

export default function SettlementPage() {
  return (
   <AppShell>
         <section className="mb-8 space-y-2">
           <h1 className="text-2xl font-semibold tracking-tight">
             Market Redemption & Settlement
           </h1>
           <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Discover RESOLVED markets to redeem your winning positions. 
              And SETTLE the markets.
           </p>
         </section>
   
         <SettlementMarketsClient />
       </AppShell>
  );
}
