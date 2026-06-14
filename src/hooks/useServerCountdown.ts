import { useEffect, useState } from "react";
import type { RobotState } from "@/hooks/useRobotState";

export function useServerNextCycleCountdown(robotState: RobotState | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return getServerNextCycleSeconds(robotState, now);
}

export function getServerNextCycleSeconds(robotState: RobotState | undefined, now = Date.now()) {
  if (!robotState?.next_cycle_at || !robotState.server_time) return null;

  const nextCycleAt = parseTimestamp(robotState.next_cycle_at);
  const serverTime = parseTimestamp(robotState.server_time);
  if (nextCycleAt == null || serverTime == null) return null;

  const elapsedSinceFetch = Math.max(0, now - robotState.fetched_at);
  const currentServerTime = serverTime + elapsedSinceFetch;
  return Math.max(0, Math.ceil((nextCycleAt - currentServerTime) / 1000));
}

function parseTimestamp(value: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const timestamp = Date.parse(hasTimezone ? value : `${value}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}
