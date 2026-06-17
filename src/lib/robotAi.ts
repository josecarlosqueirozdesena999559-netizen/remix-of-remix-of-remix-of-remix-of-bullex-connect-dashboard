import type { RobotSignal } from "../hooks/useRobotState.ts";
import { formatFriendlyRobotText } from "./robotPresentation.ts";

export type RobotAiReview = {
  statusLabel: string;
  approved: boolean | null;
  confidenceLabel: string | null;
  riskLabel: string | null;
  candleReadingLabel: string | null;
  entryReasonLabel: string | null;
  blockMessage: string | null;
  fallbackMessage: string | null;
  voiceText: string | null;
};

export function getRobotAiReview(signal: RobotSignal | null | undefined): RobotAiReview | null {
  if (!signal) return null;

  const blockMessage = signal.ai_block_reason
    ? `IA bloqueou entrada: ${formatFriendlyRobotText(signal.ai_block_reason)}`
    : null;
  const fallbackMessage = signal.ai_error
    ? "IA indisponivel, usando analise tecnica local."
    : null;
  const approved =
    signal.ai_approved != null ? signal.ai_approved : blockMessage ? false : fallbackMessage ? null : null;

  return {
    statusLabel: getAiStatusLabel(approved, fallbackMessage),
    approved,
    confidenceLabel:
      signal.ai_confidence != null ? `${Math.round(signal.ai_confidence)}%` : null,
    riskLabel: formatField(signal.ai_risk),
    candleReadingLabel: formatField(signal.ai_candle_reading),
    entryReasonLabel: formatField(signal.ai_entry_reason ?? signal.reason ?? signal.strategy_reason),
    blockMessage,
    fallbackMessage,
    voiceText: signal.ai_voice_text?.trim() ? signal.ai_voice_text.trim() : null,
  };
}

function getAiStatusLabel(approved: boolean | null, fallbackMessage: string | null) {
  if (approved === true) return "Aprovado";
  if (approved === false) return "Reprovado";
  if (fallbackMessage) return "Indisponivel";
  return "Aguardando";
}

function formatField(value: string | null | undefined) {
  if (!value) return null;
  return formatFriendlyRobotText(value);
}
