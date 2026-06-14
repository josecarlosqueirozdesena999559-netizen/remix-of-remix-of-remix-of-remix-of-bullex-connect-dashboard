import { useState } from "react";
import { Bot } from "lucide-react";
import { RobotOverlay } from "@/components/RobotOverlay";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { useRobotConnectionSync } from "@/hooks/useRobotConnectionSync";
import { useRobotNarrator } from "@/hooks/useRobotNarrator";
import { useRobotSettings } from "@/hooks/useRobotSettings";
import { useRobotState } from "@/hooks/useRobotState";
import { useServerNextCycleCountdown } from "@/hooks/useServerCountdown";

export function FloatingRobot({ userId }: { userId?: string }) {
  const [visible, setVisible] = useState(true);
  const robotState = useRobotState(userId);
  const account = useBullExAccount();
  const effectiveRobotState = useRobotConnectionSync({
    userId,
    accountConnected: account.data?.connected === true,
    robotState: robotState.data,
  });
  const { settings, saveSettings } = useRobotSettings(userId);
  const nextCycleSeconds = useServerNextCycleCountdown(effectiveRobotState);
  const narrator = useRobotNarrator(
    effectiveRobotState,
    settings.narratorEnabled,
    nextCycleSeconds,
  );

  function setOverlayVisible(nextVisible: boolean) {
    setVisible(nextVisible);
  }

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setOverlayVisible(true)}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent"
      >
        <Bot className="h-4 w-4 text-primary" />
        Mostrar robo
      </button>
    );
  }

  return (
    <RobotOverlay
      robotState={effectiveRobotState}
      account={account.data}
      narratorEnabled={settings.narratorEnabled}
      narratorSpeaking={narrator.speaking}
      onSilenceNarrator={narrator.silence}
      settings={settings}
      onSettingsChange={(nextSettings) =>
        saveSettings(nextSettings, {
          enabled: effectiveRobotState?.enabled ?? false,
          cycleMinutes: effectiveRobotState?.cycle_minutes ?? 5,
        })
      }
      onClose={() => setOverlayVisible(false)}
      showConfig
    />
  );
}
