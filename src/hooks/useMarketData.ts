import { useEffect, useState } from "react";
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
const INITIAL_CANDLE_COUNT = 60;
const UPDATE_CANDLE_COUNT = 5;

export function useMarketData(active: string | null) {
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

  useEffect(() => {
    if (!active) {
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

    setCandles([]);
    setLastPrice(null);
    setSelectedPayout(null);
    setCandlesError(null);
    setPayoutError(null);
    setLastCandleReceivedAt(null);
    setLastCandleTimestamp(null);
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
        const url = `/bullex/candles?active=${encodeURIComponent(active)}&interval=60&count=${count}`;
        const candlesResponse = await apiRequest<unknown>(url, {
          signal: candlesController.signal,
        });
        const nextCandles = normalizeCandlesPayload(active, unwrap(candlesResponse)).slice(-200);

        if (cancelled) return;

        const latestCandle = nextCandles[nextCandles.length - 1] ?? null;
        setCandles((currentCandles) => mergeCandles(currentCandles, nextCandles).slice(-200));
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
          `/bullex/payouts?active=${encodeURIComponent(active)}`,
          { signal: payoutController.signal },
        );
        const payout = normalizePayout(active, unwrap(payoutResponse)).payout;

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
  }, [active]);

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

function normalizeNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCandlesPayload(active: string, input: unknown): MarketCandle[] {
  const raw = getRawCandles(input);

  if (raw.length === 0) {
    if (input == null || (typeof input !== "object" && !Array.isArray(input))) {
      console.error("[bullex/market-data] Unexpected candles payload", { active, payload: input });
    }
    return [];
  }

  const normalized = raw
    .map((item) => normalizeCandle(active, item))
    .filter(Boolean) as MarketCandle[];
  normalized.sort((a, b) => Number(a.time) - Number(b.time));

  return normalized.filter((candle, index, array) => {
    const previous = array[index - 1];
    return !previous || Number(previous.time) !== Number(candle.time);
  });
}

function normalizeCandle(active: string, item: unknown): MarketCandle | null {
  if (!item || typeof item !== "object") {
    console.error("[bullex/market-data] Invalid candle item", { active, candle: item });
    return null;
  }

  const value = item as Record<string, unknown>;
  const open = Number(value.open);
  const high = Number(value.max ?? value.high);
  const low = Number(value.min ?? value.low);
  const close = Number(value.close);
  const rawTime = Math.floor(Number(value.from));

  if (![open, high, low, close, rawTime].every(Number.isFinite)) {
    console.error("[bullex/market-data] Unexpected candle shape", { active, candle: item });
    return null;
  }

  return {
    time: rawTime as UTCTimestamp,
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
  }

  if (Array.isArray(value.candles)) return value.candles;
  return [];
}
