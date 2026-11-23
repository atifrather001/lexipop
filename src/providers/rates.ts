/* LexiPop - exchange rates (open.er-api.com: free, no key, updated daily, base USD) */

const API = "https://open.er-api.com/v6/latest/USD";
const TTL = 12 * 60 * 60 * 1000;

export interface RateTable {
  rates: Record<string, number>;
  /** Provider's own "last updated" time (ms). */
  updatedAt: number;
}

let memo: { table: RateTable; fetchedAt: number } | null = null;

/** Rates per 1 USD. Uses `stored` (e.g. from the DB) when offline. */
export async function getRates(stored?: RateTable | null): Promise<{ table: RateTable | null; fresh: boolean }> {
  if (memo && Date.now() - memo.fetchedAt < TTL) return { table: memo.table, fresh: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(API, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = (await res.json()) as {
        result?: string;
        rates?: Record<string, number>;
        time_last_update_unix?: number;
      };
      if (data.result === "success" && data.rates) {
        const table: RateTable = { rates: data.rates, updatedAt: (data.time_last_update_unix ?? 0) * 1000 || Date.now() };
        memo = { table, fetchedAt: Date.now() };
        return { table, fresh: true };
      }
    }
  } catch {
    // offline: fall back below
  } finally {
    clearTimeout(timer);
  }
  if (memo) return { table: memo.table, fresh: false };
  return { table: stored ?? null, fresh: false };
}
