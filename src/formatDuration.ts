const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export function formatDuration(ms: number): string {
  if (ms < 0) {
    throw new Error(`formatDuration: negative input not supported (got ${ms})`);
  }
  if (ms === 0) return "0 s";
  if (ms >= MS_PER_DAY) return `${(ms / MS_PER_DAY).toFixed(1)} d`;
  if (ms >= MS_PER_HOUR) return `${(ms / MS_PER_HOUR).toFixed(1)} h`;
  if (ms >= MS_PER_MINUTE) return `${(ms / MS_PER_MINUTE).toFixed(1)} m`;
  return `${(ms / MS_PER_SECOND).toFixed(1)} s`;
}
