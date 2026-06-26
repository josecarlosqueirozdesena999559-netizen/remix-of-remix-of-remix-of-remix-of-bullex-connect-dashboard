import type { BullExAccountState } from "@/hooks/useBullExAccount";
import type { BullexConnectionStatus } from "@/hooks/useBullExStatus";

export function isBullExConnected({
  account,
  accountStatus,
  cachedGrace = false,
  pendingConnect = false,
}: {
  account?: BullExAccountState;
  accountStatus?: BullexConnectionStatus;
  cachedGrace?: boolean;
  pendingConnect?: boolean;
}) {
  if (cachedGrace || pendingConnect) return true;

  return (
    account?.connected === true ||
    account?.status === "connected" ||
    accountStatus?.status?.toUpperCase() === "CONNECTED"
  );
}

export function isBullExDisconnected({
  account,
  accountStatus,
  cachedGrace = false,
  pendingConnect = false,
}: {
  account?: BullExAccountState;
  accountStatus?: BullexConnectionStatus;
  cachedGrace?: boolean;
  pendingConnect?: boolean;
}) {
  if (isBullExConnected({ account, accountStatus, cachedGrace, pendingConnect })) return false;

  return (
    account?.connected === false ||
    account?.status === "disconnected" ||
    accountStatus?.status?.toUpperCase() === "DISCONNECTED"
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
