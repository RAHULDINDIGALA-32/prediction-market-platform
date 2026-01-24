"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
  getDefaultConfig,
  RainbowKitProvider,
  lightTheme
} from "@rainbow-me/rainbowkit";
import { WagmiProvider, http } from "wagmi";
import {
  mainnet,
  sepolia,
  base,
} from "wagmi/chains";
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo-project-id";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111"); // default sepolia
const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL

if (!SEPOLIA_RPC_URL) {
  throw new Error("Missing NEXT_PUBLIC_RPC_URL environment variable");
}
const availableChains = [mainnet, sepolia, base];
const defaultChain =
  availableChains.find((c) => c.id === chainId) ?? sepolia;

const config = getDefaultConfig({
  appName: "Prediction Market Dapp",
  projectId,
  chains: [defaultChain],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
  ssr: true,
});

const queryClient = new QueryClient();

const WalletProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
        theme={lightTheme({
      accentColor: 'white',
      accentColorForeground: 'black',
      borderRadius: 'small',
      fontStack: 'system',
      overlayBlur: 'small',
    })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export {config, WalletProviders};
