import type { TargetType } from '@pizarra/shared';
import type { AppContext } from '../context';
import { hideContent } from '../services/moderation';

export interface AnalysisInput {
  type: TargetType;
  id: number;
  text: string;
}


export type AnalysisVerdict = { ok: true } | { ok: false; reason?: string };


export const analyzer = {
  async analyze(_input: AnalysisInput, _signal: AbortSignal): Promise<AnalysisVerdict> {
    return { ok: true };
  },
};

const TIMEOUT_MS = 10_000;

export function analizarPublicacion(
  ctx: AppContext,
  input: AnalysisInput,
  autorModerador: string | null,
): void {
  if (autorModerador !== null) return;
  void analyzer
    .analyze(input, AbortSignal.timeout(TIMEOUT_MS))
    .then((v) => {
      if (!v.ok) hideContent(ctx, input.type, input.id, 'IA', 'ia');
    })
    .catch(() => {});
}
