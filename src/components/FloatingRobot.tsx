import { useState } from "react";
import { Bot } from "lucide-react";
import { RobotOverlay } from "@/components/RobotOverlay";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { useRobotConnectionSync } from "@/hooks/useRobotConnectionSync";
import { useRobotNarrator } from "@/hooks/useRobotNarrator";
import { useRobotSettings } from "@/hooks/useRobotSettings";
import { useRobotState, type RobotState } from "@/hooks/useRobotState";
import { useSmoothCountdown } from "@/hooks/useSmoothCountdown";

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
  const nextCycleSeconds = useSmoothCountdown(
    effectiveRobotState?.display_countdown_seconds ?? effectiveRobotState?.seconds_until_next_cycle,
    getNextCycleResetKey(effectiveRobotState),
    Boolean(
      effectiveRobotState?.enabled &&
        ((effectiveRobotState.display_countdown_seconds ??
          effectiveRobotState.seconds_until_next_cycle) > 0),
    ),
    effectiveRobotState?.fetched_at,
  );
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

function getNextCycleResetKey(robotState: RobotState | undefined) {
  if (!robotState) return null;
  return [
    robotState.status,
    robotState.next_cycle_at ?? "-",
    robotState.display_countdown_label ?? "-",
    robotState.last_trade?.finished_at ?? "-",
  ].join("|");
}
