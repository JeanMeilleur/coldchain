/**
 * Decimal-safe JSON serialization.
 *
 * Money is stored as Postgres NUMERIC and arrives as a Prisma Decimal object.
 * Left alone, JSON.stringify turns it into a quoted string ("42117.48"), which
 * silently breaks any client doing arithmetic or charting on it.
 *
 * The rule this codebase follows: values stay exact in the database, where all
 * the summing happens, and are converted to Number only at the response
 * boundary, where they are display data and precision no longer accumulates.
 */
import { Prisma } from "@prisma/client";

export function serialize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as any).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => serialize(v)) as any;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out as T;
  }
  return value;
}
