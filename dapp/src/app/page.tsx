import Image from "next/image";
import MarketCard from "@/components/MarketCard";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col items-center justify-start py-16 px-6 bg-white dark:bg-black sm:items-start">
        <div className="mb-8 flex w-full items-center justify-between">
          <div className="flex items-center gap-4">
            <Image className="dark:invert" src="/next.svg" alt="Next.js logo" width={64} height={20} priority />
            <h1 className="text-xl font-semibold">Prediction Market Dapp</h1>
          </div>
        </div>

        <MarketCard />
      </main>
    </div>
  );
}
