/**
 * Structured log, one JSON line per event. Never log personal data: only ids, lender names,
 * statuses, reason codes and timings. Injected into the orchestrator so tests can capture events.
 */
export type LogEvent = { readonly event: string } & Record<string, unknown>;

export type Logger = (event: LogEvent) => void;

export const consoleLogger: Logger = (event) => {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...event }));
};

export const silentLogger: Logger = () => {};
