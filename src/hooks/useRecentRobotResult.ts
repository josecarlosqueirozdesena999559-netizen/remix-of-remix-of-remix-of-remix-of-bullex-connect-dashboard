import { useEffect, useState } from "react";
import type { RobotState } from "@/hooks/useRobotState";

export type RecentRobotResult = "WIN" | "LOSS" | null;

const RESULT_DISPLAY_MS = 5000;

export function useRecentRobotResult(robotState?: RobotState): RecentRobotResult {
  const trade = robotState?.last_trade;
  const result = trade?.result === "WIN" || trade?.result === "LOSS" ? trade.result : null;
  const tradeKey = result ? `${trade?.active ?? ""}:${trade?.sent_at ?? ""}:${result}` : null;
  const [recentResult, setRecentResult] = useState<RecentRobotResult>(null);

  useEffect(() => {
    if (!tradeKey || !result) {
      setRecentResult(null);
      return;
    }

    setRecentResult(result);
    const timer = window.setTimeout(() => setRecentResult(null), RESULT_DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [result, tradeKey]);

  return recentResult;
}
