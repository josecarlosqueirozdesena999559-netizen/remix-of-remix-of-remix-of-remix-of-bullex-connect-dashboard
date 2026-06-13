import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { RobotOverlay } from "@/components/RobotOverlay";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { useRobotState } from "@/hooks/useRobotState";

export function FloatingRobot({ userId }: { userId?: string }) {
  const navigate = useNavigate();
  const visibilityKey = `robot-overlay-visible:${userId ?? "anonymous"}`;
  const positionKey = `robot-overlay-position:${userId ?? "anonymous"}`;
  const [visible, setVisible] = useState(() => readVisibility(visibilityKey));
  const robotState = useRobotState(userId);
  const account = useBullExAccount();

  useEffect(() => {
    setVisible(readVisibility(visibilityKey));
  }, [visibilityKey]);

  function setOverlayVisible(nextVisible: boolean) {
    setVisible(nextVisible);
    localStorage.setItem(visibilityKey, String(nextVisible));
  }

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setOverlayVisible(true)}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full border border-primary/40 bg-background/90 px-3 py-2 text-xs font-semibold text-foreground shadow-xl backdrop-blur transition hover:bg-accent"
      >
        <Bot className="h-4 w-4 text-primary" />
        Mostrar robô
      </button>
    );
  }

  return (
    <RobotOverlay
      robotState={robotState.data}
      account={account.data}
      storageKey={positionKey}
      onClose={() => setOverlayVisible(false)}
      onConfig={() => void navigate({ to: "/robot" })}
    />
  );
}

function readVisibility(storageKey: string) {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(storageKey) !== "false";
}
