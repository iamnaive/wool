import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

import { WagmiProvider } from "wagmi";
import { config } from "./utils/wagmiConfigLike";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
