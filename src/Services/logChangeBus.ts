// A tiny "something was logged" signal. The day hooks each keep their
// own copy of the day's log rows, so a write made from one place (the
// dashboard's session timer) would leave the others stale until they
// remounted. They subscribe here and re-read when it fires.
const listeners = new Set<() => void>();

export function subscribeToLogChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLogsChanged(): void {
  listeners.forEach(listener => listener());
}
