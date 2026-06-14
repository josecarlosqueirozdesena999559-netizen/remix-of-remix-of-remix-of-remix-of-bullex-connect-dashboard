import { useEffect, useRef, useState } from "react";

export function useSmoothCountdown(
  sourceSeconds: number | null | undefined,
  resetKey: string | null | undefined,
  active = true,
) {
  const resetKeyRef = useRef<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    const nextSeconds = normalizeSeconds(sourceSeconds);

    if (!active || nextSeconds == null) {
      resetKeyRef.current = null;
      setRemainingSeconds(null);
      return;
    }

    setRemainingSeconds((currentSeconds) => {
      const nextResetKey = resetKey ?? "";
      const changedCycle = resetKeyRef.current !== nextResetKey;
      resetKeyRef.current = nextResetKey;

      if (changedCycle || currentSeconds == null || nextSeconds > currentSeconds + 3) {
        return nextSeconds;
      }

      return currentSeconds;
    });
  }, [active, resetKey, sourceSeconds]);

  useEffect(() => {
    if (!active || remainingSeconds == null) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((currentSeconds) => {
        if (currentSeconds == null) return null;
        return Math.max(0, currentSeconds - 1);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [active, remainingSeconds]);

  return remainingSeconds;
}

function normalizeSeconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.ceil(value));
}
