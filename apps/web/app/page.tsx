"use client";

import dynamic from "next/dynamic";

import { Providers } from "./providers";

const TradingPortal = dynamic(
  () => import("@/components/trading-portal").then((module) => module.TradingPortal),
  {
    ssr: false
  }
);

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <Providers>
        <TradingPortal />
      </Providers>
    </main>
  );
}
