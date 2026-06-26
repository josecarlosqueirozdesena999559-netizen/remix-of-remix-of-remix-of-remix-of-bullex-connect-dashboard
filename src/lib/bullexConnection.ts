import type { BullExAccountState } from "@/hooks/useBullExAccount";
import type { BullexConnectionStatus } from "@/hooks/useBullExStatus";

export function isBullExConnected({
  account,
  accountStatus,
  cachedGrace = false,
}: {
  account?: BullExAccountState;
  accountStatus?: BullexConnectionStatus;
  cachedGrace?: boolean;
}) {
  if (cachedGrace) return true;

  return (
    account?.connected === true ||
    account?.status === "connected" ||
    accountStatus?.status === "connected"
  );
}

export function isBullExDisconnected({
  account,
  accountStatus,
  cachedGrace = false,
}: {
  account?: BullExAccountState;
  accountStatus?: BullexConnectionStatus;
  cachedGrace?: boolean;
}) {
  if (isBullExConnected({ account, accountStatus, cachedGrace })) return false;

  return (
    account?.connected === false ||
    account?.status === "disconnected" ||
    accountStatus?.status === "disconnected"
  );
}

export function formatBullExBalance(
  balance: number | null | undefined,
  currency: string | null | undefined,
) {
  if (balance === null || balance === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency ?? "USD",
  }).format(balance);
}
