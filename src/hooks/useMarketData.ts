import { useEffect, useRef, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { ApiError, apiRequest, type ApiResult } from "@/lib/api";

export type MarketCandle = CandlestickData<UTCTimestamp>;

type Payout = {
  active: string;
  payout: number | null;
};

export type MarketPollingStatus = "idle" | "polling" | "error";

const CANDLES_POLL_INTERVAL_MS = 1000;
const PAYOUT_POLL_INTERVAL_MS = 5000;
const MARKET_REQUEST_TIMEOUT_MS = 8000;
const INITIAL_CANDLE_COUNT = 100;
const UPDATE_CANDLE_COUNT = 2;

export function useMarketData(symbol: string | null, timeframe = "M1") {
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<number | null>(null);
  const [isCandlesLoading, setIsCandlesLoading] = useState(false);
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<unknown>(null);
  const [payoutError, setPayoutError] = useState<unknown>(null);
  const [lastCandleReceivedAt, setLastCandleReceivedAt] = useState<Date | null>(null);
  const [lastCandleTimestamp, setLastCandleTimestamp] = useState<UTCTimestamp | null>(null);
  const [pollingStatus, setPollingStatus] = useState<MarketPollingStatus>("idle");
  const candlesCacheRef = useRef(new Map<string, MarketCandle[]>());

  useEffect(() => {
    if (!symbol) {
      candlesCacheRef.current.clear();
      setCandles([]);
      setLastPrice(null);
      setSelectedPayout(null);
      setIsCandlesLoading(false);
      setIsPayoutLoading(false);
      setCandlesError(null);
      setPayoutError(null);
      setLastCandleReceivedAt(null);
      setLastCandleTimestamp(null);
      setPollingStatus("idle");
      return;
    }

    let cancelled = false;
    let candlesInFlight = false;
    let payoutInFlight = false;
    let hasInitialCandles = false;
    let candlesTimer: number | null = null;
    let payoutTimer: number | null = null;
    let candlesController: AbortController | null = null;
    let payoutController: AbortController | null = null;

    const cachedCandles = candlesCacheRef.current.get(symbol) ?? [];
    setCandles(cachedCandles);
    if (cachedCandles.length > 0) {
      setCandles(cachedCandles);
      const latestCached = cachedCandles[cachedCandles.length - 1] ?? null;
      setLastPrice(latestCached?.close ?? null);
      setLastCandleTimestamp(latestCached?.time ?? null);
      hasInitialCandles = true;
    } else {
      setLastPrice(null);
      setLastCandleTimestamp(null);
    }

    setSelectedPayout(null);
    setCandlesError(null);
    setPayoutError(null);
    setLastCandleReceivedAt(null);
    setIsCandlesLoading(true);
    setIsPayoutLoading(true);
    setPollingStatus("polling");

    const fetchCandles = async () => {
      if (cancelled || candlesInFlight) return;
      candlesInFlight = true;
      candlesController = new AbortController();
      const timeout = window.setTimeout(
        () => candlesController?.abort(),
        MARKET_REQUEST_TIMEOUT_MS,
      );

      try {
        const count = hasInitialCandles ? UPDATE_CANDLE_COUNT : INITIAL_CANDLE_COUNT;
        const url = `/bullex/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${count}`;
        const candlesResponse = await apiRequest<unknown>(url, {
          signal: candlesController.signal,
        });
        const nextCandles = normalizeCandlesPayload(symbol, unwrap(candlesResponse)).slice(-200);

        if (cancelled) return;

        setCandles((currentCandles) => {
          const merged = mergeCandles(currentCandles, nextCandles).slice(-200);
          candlesCacheRef.current.set(symbol, merged);
          return merged;
        });

        const latestCandle = nextCandles[nextCandles.length - 1] ?? null;
        console.log("[CHART_CANDLES_UPDATED]", {
          symbol,
          received: nextCandles.length,
          latest_time: latestCandle?.time ?? null,
        });

        if (latestCandle) {
          hasInitialCandles = true;
          setLastPrice(latestCandle.close);
          setLastCandleTimestamp(latestCandle.time);
          setLastCandleReceivedAt(new Date());
        }

        setCandlesError(null);
        setPollingStatus("polling");
      } catch (error) {
        if (!cancelled) {
          setCandlesError(error);
          setPollingStatus("error");
        }
      } finally {
        window.clearTimeout(timeout);
        candlesController = null;
        candlesInFlight = false;
        if (!cancelled) {
          setIsCandlesLoading(false);
          candlesTimer = window.setTimeout(() => {
            void fetchCandles();
          }, CANDLES_POLL_INTERVAL_MS);
        }
      }
    };

    const fetchPayout = async () => {
      if (cancelled || payoutInFlight) return;
      payoutInFlight = true;
      payoutController = new AbortController();
      const timeout = window.setTimeout(() => payoutController?.abort(), MARKET_REQUEST_TIMEOUT_MS);

      try {
        const payoutResponse = await apiRequest<unknown>(
          `/bullex/payouts?active=${encodeURIComponent(symbol)}`,
          { signal: payoutController.signal },
        );
        const payout = normalizePayout(symbol, unwrap(payoutResponse)).payout;

        if (cancelled) return;

        setSelectedPayout(payout);
        setPayoutError(null);
      } catch (error) {
        if (!cancelled) {
          setPayoutError(error);
          setSelectedPayout(null);
        }
      } finally {
        window.clearTimeout(timeout);
        payoutController = null;
        payoutInFlight = false;
        if (!cancelled) {
          setIsPayoutLoading(false);
          payoutTimer = window.setTimeout(() => {
            void fetchPayout();
          }, PAYOUT_POLL_INTERVAL_MS);
        }
      }
    };

    void fetchCandles();
    payoutTimer = window.setTimeout(() => {
      void fetchPayout();
    }, 500);

    return () => {
      cancelled = true;
      candlesController?.abort();
      payoutController?.abort();
      if (candlesTimer != null) window.clearTimeout(candlesTimer);
      if (payoutTimer != null) window.clearTimeout(payoutTimer);
    };
  }, [symbol, timeframe]);

  return {
    candles,
    candlesError,
    isCandlesLoading,
    isPayoutLoading,
    lastCandleReceivedAt,
    lastCandleTimestamp,
    lastPrice,
    payoutError,
    pollingStatus,
    selectedPayout,
  };
}

function mergeCandles(currentCandles: MarketCandle[], nextCandles: MarketCandle[]) {
  if (currentCandles.length === 0) return nextCandles;
  if (nextCandles.length === 0) return currentCandles;

  const byTime = new Map<number, MarketCandle>();
  for (const candle of currentCandles) {
    byTime.set(Number(candle.time), candle);
  }

  for (const candle of nextCandles) {
    byTime.set(Number(candle.time), candle);
  }

  return Array.from(byTime.values()).sort((a, b) => Number(a.time) - Number(b.time));
}

function unwrap<T>(res: ApiResult<T>): T {
  if (!res.ok) throw new ApiError(res.error, res.code);
  return res.data;
}

function normalizePayout(active: string, input: unknown): Payout {
  const data = getPayoutResponseData(input);
  const row = data?.[0];

  if (!row || typeof row !== "object") {
    console.error("[bullex/market-data] Unexpected payouts payload", { active, payload: input });
    return { active, payout: null };
  }

  const payout = normalizeNumber((row as Record<string, unknown>).payout);

  if (payout == null) {
    console.error("[bullex/market-data] Unexpected payout row", { active, row });
    return { active, payout: null };
  }

  return { active, payout };
}

function getPayoutResponseData(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return null;

  const value = input as Record<string, unknown>;
  return Array.isArray(value.data) ? value.data : null;
}

function normalizeCandlesPayload(active: string, input: unknown): MarketCandle[] {
  const raw = getRawCandles(input);

  if (raw.length === 0) {
    if (input == null || (typeof input !== "object" && !Array.isArray(input))) {
      console.error("[bullex/market-data] Unexpected candles payload", { active, payload: input });
    }
    return [];
  }

  const byTime = new Map<number, MarketCandle>();
  const seenTimes = new Set<number>();

  for (const item of raw) {
    const candle = normalizeCandle(item, active);
    if (!candle) continue;

    const candleTime = Number(candle.time);
    if (seenTimes.has(candleTime)) {
      console.warn("[INVALID_CANDLE_DROPPED]", {
        active,
        reason: "duplicate_timestamp",
        time: candle.time,
      });
      continue;
    }

    seenTimes.add(candleTime);
    byTime.set(Number(candle.time), candle);
    console.log("[CHART_CANDLE_NORMALIZED]", {
      active,
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
  }

  return Array.from(byTime.values()).sort((a, b) => Number(a.time) - Number(b.time));
}

function normalizeCandle(raw: unknown, active: string): MarketCandle | null {
  if (!raw || typeof raw !== "object") return null;

  const wrapper = raw as Record<string, unknown>;
  const candle =
    wrapper.candle && typeof wrapper.candle === "object"
      ? (wrapper.candle as Record<string, unknown>)
      : wrapper;

  const open = normalizeNumber(candle.open);
  const high = normalizeNumber(candle.high ?? candle.max);
  const low = normalizeNumber(candle.low ?? candle.min);
  const close = normalizeNumber(candle.close);

  if (open == null || high == null || low == null || close == null) {
    console.warn("[INVALID_CANDLE_DROPPED]", { active, reason: "nan_price", raw });
    return null;
  }

  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
    console.warn("[INVALID_CANDLE_DROPPED]", { active, reason: "zero_or_negative_price", raw });
    return null;
  }

  if (high < low) {
    console.warn("[INVALID_CANDLE_DROPPED]", { active, reason: "high_below_low", raw });
    return null;
  }

  const timeValue = candle.time ?? candle.from ?? candle.at ?? candle.timestamp;
  const parsedTime = normalizeNumber(timeValue);
  if (parsedTime == null) {
    console.warn("[INVALID_CANDLE_DROPPED]", { active, reason: "invalid_timestamp", raw });
    return null;
  }

  const timeInSeconds = Math.floor(parsedTime > 10_000_000_000 ? parsedTime / 1000 : parsedTime);
  if (!Number.isFinite(timeInSeconds) || timeInSeconds <= 0) {
    console.warn("[INVALID_CANDLE_DROPPED]", { active, reason: "non_finite_timestamp", raw });
    return null;
  }

  return {
    time: timeInSeconds as UTCTimestamp,
    open,
    high,
    low,
    close,
  };
}

function getRawCandles(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];

  const value = input as Record<string, unknown>;
  if (Array.isArray(value.data)) return value.data;

  const data = value.data;
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    if (Array.isArray(nested.candles)) return nested.candles;
    if (nested.candle && typeof nested.candle === "object") return [nested];
  }

  if (Array.isArray(value.candles)) return value.candles;
  if (value.candle && typeof value.candle === "object") return [value];
  if (hasCandlePrices(value)) return [value];
  return [];
}

function hasCandlePrices(value: Record<string, unknown>) {
  return (
    value.open != null &&
    (value.high != null || value.max != null) &&
    (value.low != null || value.min != null) &&
    value.close != null
  );
}

function normalizeNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
