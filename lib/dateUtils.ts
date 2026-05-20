// Malaysia is always UTC+8 (no DST) — direct calculation avoids locale parsing issues on Windows
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

export function todayRangeKL() {
  const klNowMs = Date.now() + KL_OFFSET_MS;
  const klDayStartMs = Math.floor(klNowMs / 86_400_000) * 86_400_000;
  return {
    start: new Date(klDayStartMs - KL_OFFSET_MS).toISOString(),
    end: new Date(klDayStartMs - KL_OFFSET_MS + 86_400_000).toISOString(),
  };
}
