import type { Metadata } from "next";
import BacktestWorkspace from "@/components/backtest/BacktestWorkspace";

export const metadata: Metadata = { title: "Backtest - Tradebook" };

export default function BacktestPage() {
  return <BacktestWorkspace />;
}
