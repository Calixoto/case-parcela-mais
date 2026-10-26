/** Time as a dependency: the orchestrator never touches Date or timers directly, so tests run in milliseconds. */
export type Clock = {
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

/** Reads the globals lazily, so Vitest fake timers also drive it. */
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
