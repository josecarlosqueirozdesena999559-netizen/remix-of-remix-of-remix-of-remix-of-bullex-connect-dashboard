import { useEffect, useRef, useState } from "react";

export function useSmoothCountdown(
  sourceSeconds: number | null | undefined,
  resetKey: string | null | undefined,
  active = true,
  sourceVersion?: number | null,
) {
  const resetKeyRef = useRef<string | null>(null);
  const receivedAtRef = useRef<number>(Date.now());
  const serverSecondsRef = useRef<number | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState<number | null>(null);

  useEffect(() => {
    const nextSeconds = normalizeSeconds(sourceSeconds);

    if (!active || nextSeconds == null) {
      resetKeyRef.current = null;
      serverSecondsRef.current = null;
      setDisplaySeconds(null);
      return;
    }

    setDisplaySeconds((currentSeconds) => {
      const nextResetKey = resetKey ?? "";
      const changedCycle = resetKeyRef.current !== nextResetKey;
      resetKeyRef.current = nextResetKey;
      receivedAtRef.current = Date.now();

      if (
        !changedCycle &&
        currentSeconds != null &&
        nextSeconds > currentSeconds &&
        nextSeconds <= currentSeconds + 2
      ) {
        serverSecondsRef.current = currentSeconds;
        return currentSeconds;
      }

      serverSecondsRef.current = nextSeconds;
      if (changedCycle || currentSeconds == null || nextSeconds > currentSeconds + 2) {
        return nextSeconds;
      }

      return Math.min(currentSeconds, nextSeconds);
    });
  }, [active, resetKey, sourceSeconds, sourceVersion]);

  useEffect(() => {
    if (!active || displaySeconds == null) return;

    const timer = window.setInterval(() => {
      setDisplaySeconds((currentSeconds) => {
        const serverSeconds = serverSecondsRef.current;
        if (currentSeconds == null || serverSeconds == null) return currentSeconds;
        const elapsed = Math.floor((Date.now() - receivedAtRef.current) / 1000);
        const nextSeconds = Math.max(0, serverSeconds - elapsed);
        return Math.min(currentSeconds, nextSeconds);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [active, displaySeconds]);

  return displaySeconds;
}

function normalizeSeconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.ceil(value));
}
