"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
  getDefaultConfig,
  RainbowKitProvider,
  lightTheme
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
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

const availableChains = [mainnet, sepolia, base];
const defaultChain =
  availableChains.find((c) => c.id === chainId) ?? sepolia;

const config = getDefaultConfig({
  appName: "Prediction Market Dapp",
  projectId,
  chains: [defaultChain],
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
