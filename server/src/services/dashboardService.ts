/**
 * Dashboard aggregation.
 *
 * The tutorial this project grew out of had SalesSummary / PurchaseSummary /
 * ExpenseSummary tables that the seed script filled with pre-computed totals.
 * The dashboard read those rows directly, so the charts were displaying
 * numbers nobody had calculated from anything. Adding a sale changed no chart.
 *
 * Those tables are gone. Every figure below is aggregated live from the
 * StockMovement ledger and the Lot table, which means the dashboard is a
 * true view of the data and cannot drift out of sync with it.
 */

import prisma from "../lib/prisma";

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const pctChange = (current: number, previous: number) =>
  previous === 0 ? null : Number((((current - previous) / previous) * 100).toFixed(1));

// ---------------------------------------------------------------------------

/** Stock value on hand, and how much of it is about to die. */
async function getStockPosition(atRiskDays: number) {
  const [row] = await prisma.$queryRaw<
    {
      onHandValue: number;
      onHandUnits: number;
      atRiskValue: number;
      atRiskLots: number;
      quarantinedValue: number;
    }[]
  >`
    SELECT
      COALESCE(SUM("quantityRemaining" * "unitCost") FILTER (
        WHERE NOT "isQuarantined"), 0)::float AS "onHandValue",
      COALESCE(SUM("quantityRemaining") FILTER (
        WHERE NOT "isQuarantined"), 0)::int AS "onHandUnits",
      COALESCE(SUM("quantityRemaining" * "unitCost") FILTER (
        WHERE NOT "isQuarantined"
          AND "expiresAt" <= NOW() + (${atRiskDays} || ' days')::interval), 0)::float AS "atRiskValue",
      COUNT(*) FILTER (
        WHERE NOT "isQuarantined"
          AND "expiresAt" <= NOW() + (${atRiskDays} || ' days')::interval)::int AS "atRiskLots",
      COALESCE(SUM("quantityRemaining" * "unitCost") FILTER (
        WHERE "isQuarantined"), 0)::float AS "quarantinedValue"
    FROM "Lot"
    WHERE "quantityRemaining" > 0 AND "expiresAt" > NOW()`;
  return row;
}

/** Revenue, cost of goods received, and waste for a window, with the
 *  immediately preceding window of equal length for comparison. */
async function getPeriodTotals(days: number) {
  const [row] = await prisma.$queryRaw<
    {
      revenue: number;
      received: number;
      waste: number;
      prevRevenue: number;
      prevReceived: number;
      prevWaste: number;
    }[]
  >`
    WITH windows AS (
      SELECT
        type, quantity, "unitValue",
        ("occurredAt" >= NOW() - (${days} || ' days')::interval) AS is_current,
        ("occurredAt" <  NOW() - (${days} || ' days')::interval
         AND "occurredAt" >= NOW() - (${days * 2} || ' days')::interval) AS is_previous
      FROM "StockMovement"
      WHERE "occurredAt" >= NOW() - (${days * 2} || ' days')::interval
    )
    SELECT
      COALESCE(SUM(-quantity * "unitValue") FILTER (WHERE is_current  AND type='SALE'), 0)::float AS "revenue",
      COALESCE(SUM( quantity * "unitValue") FILTER (WHERE is_current  AND type='RECEIPT'), 0)::float AS "received",
      COALESCE(SUM(-quantity * "unitValue") FILTER (WHERE is_current  AND type='WASTE'), 0)::float AS "waste",
      COALESCE(SUM(-quantity * "unitValue") FILTER (WHERE is_previous AND type='SALE'), 0)::float AS "prevRevenue",
      COALESCE(SUM( quantity * "unitValue") FILTER (WHERE is_previous AND type='RECEIPT'), 0)::float AS "prevReceived",
      COALESCE(SUM(-quantity * "unitValue") FILTER (WHERE is_previous AND type='WASTE'), 0)::float AS "prevWaste"
    FROM windows`;
  return row;
}

/**
 * Daily series for the trend charts.
 *
 * generate_series produces the calendar first and LEFT JOINs the data onto
 * it, so a day with no sales comes back as zero rather than being missing.
 * Without that, a quiet Sunday silently vanishes and the chart draws a
 * straight line across it, which misrepresents the data.
 */
async function getDailySeries(days: number) {
  return prisma.$queryRaw<
    { day: Date; revenue: number; waste: number; received: number }[]
  >`
    WITH calendar AS (
      SELECT generate_series(
        date_trunc('day', NOW() - (${days - 1} || ' days')::interval),
        date_trunc('day', NOW()),
        '1 day'
      ) AS day
    )
    SELECT
      c.day,
      COALESCE(SUM(-m.quantity * m."unitValue") FILTER (WHERE m.type='SALE'), 0)::float AS revenue,
      COALESCE(SUM(-m.quantity * m."unitValue") FILTER (WHERE m.type='WASTE'), 0)::float AS waste,
      COALESCE(SUM( m.quantity * m."unitValue") FILTER (WHERE m.type='RECEIPT'), 0)::float AS received
    FROM calendar c
    LEFT JOIN "StockMovement" m
      ON date_trunc('day', m."occurredAt") = c.day
    GROUP BY c.day
    ORDER BY c.day`;
}

/** Why we are throwing food away. */
async function getWasteByReason(days: number) {
  return prisma.$queryRaw<{ reason: string; units: number; cost: number }[]>`
    SELECT
      COALESCE("wasteReason"::text, 'UNSPECIFIED') AS reason,
      SUM(-quantity)::int AS units,
      SUM(-quantity * "unitValue")::float AS cost
    FROM "StockMovement"
    WHERE type = 'WASTE' AND "occurredAt" >= NOW() - (${days} || ' days')::interval
    GROUP BY 1
    ORDER BY cost DESC`;
}

/** Which products bleed the most money into the bin. */
async function getWorstWasteProducts(days: number, limit: number) {
  return prisma.$queryRaw<
    { productId: string; sku: string; name: string; units: number; cost: number; shelfLifeDays: number }[]
  >`
    SELECT p."productId", p.sku, p.name, p."shelfLifeDays",
           SUM(-m.quantity)::int AS units,
           SUM(-m.quantity * m."unitValue")::float AS cost
    FROM "StockMovement" m
    JOIN "Lot" l     ON l."lotId" = m."lotId"
    JOIN "Product" p ON p."productId" = l."productId"
    WHERE m.type = 'WASTE'
      AND m."occurredAt" >= NOW() - (${days} || ' days')::interval
    GROUP BY p."productId", p.sku, p.name, p."shelfLifeDays"
    ORDER BY cost DESC
    LIMIT ${limit}`;
}

/** The actual action list: lots about to expire, soonest first. */
async function getExpiringLots(withinDays: number, limit: number) {
  return prisma.$queryRaw<
    {
      lotId: string; lotCode: string; productName: string; sku: string;
      locationName: string | null; quantityRemaining: number;
      expiresAt: Date; daysLeft: number; valueAtRisk: number;
    }[]
  >`
    SELECT l."lotId", l."lotCode", p.name AS "productName", p.sku,
           loc.name AS "locationName",
           l."quantityRemaining",
           l."expiresAt",
           EXTRACT(DAY FROM (l."expiresAt" - NOW()))::int AS "daysLeft",
           (l."quantityRemaining" * l."unitCost")::float AS "valueAtRisk"
    FROM "Lot" l
    JOIN "Product" p       ON p."productId" = l."productId"
    LEFT JOIN "Location" loc ON loc."locationId" = l."locationId"
    WHERE l."quantityRemaining" > 0
      AND NOT l."isQuarantined"
      AND l."expiresAt" > NOW()
      AND l."expiresAt" <= NOW() + (${withinDays} || ' days')::interval
    ORDER BY l."expiresAt" ASC
    LIMIT ${limit}`;
}

/**
 * Products at or below their reorder point.
 *
 * On-hand is computed from lots -- excluding expired and quarantined stock,
 * because stock you cannot sell is not stock. A product can sit on this list
 * while its raw lot total looks healthy, which is exactly the failure mode
 * a bare stockQuantity column hides from you.
 */
async function getReorderList(limit: number) {
  return prisma.$queryRaw<
    {
      productId: string; sku: string; name: string; onHand: number;
      reorderPoint: number; supplierName: string | null; leadTimeDays: number | null;
    }[]
  >`
    SELECT p."productId", p.sku, p.name, p."reorderPoint",
           s.name AS "supplierName", s."leadTimeDays",
           COALESCE(SUM(l."quantityRemaining") FILTER (
             WHERE NOT l."isQuarantined" AND l."expiresAt" > NOW()
           ), 0)::int AS "onHand"
    FROM "Product" p
    LEFT JOIN "Lot" l      ON l."productId" = p."productId" AND l."quantityRemaining" > 0
    LEFT JOIN "Supplier" s ON s."supplierId" = p."supplierId"
    WHERE p."isActive"
    GROUP BY p."productId", p.sku, p.name, p."reorderPoint", s.name, s."leadTimeDays"
    HAVING COALESCE(SUM(l."quantityRemaining") FILTER (
             WHERE NOT l."isQuarantined" AND l."expiresAt" > NOW()
           ), 0) <= p."reorderPoint"
    ORDER BY (COALESCE(SUM(l."quantityRemaining") FILTER (
             WHERE NOT l."isQuarantined" AND l."expiresAt" > NOW()
           ), 0)::float / NULLIF(p."reorderPoint", 0)) ASC
    LIMIT ${limit}`;
}

/** Cold-chain compliance: current temperature and recent excursions. */
async function getColdChainStatus(days: number) {
  return prisma.$queryRaw<
    {
      locationId: string; name: string; zone: string;
      targetTempC: number | null; toleranceC: number;
      latestTempC: number | null; latestReadingAt: Date | null;
      excursions: number; lotsStored: number;
    }[]
  >`
    SELECT loc."locationId", loc.name, loc.zone::text AS zone,
           loc."targetTempC", loc."toleranceC",
           latest."tempC"      AS "latestTempC",
           latest."recordedAt" AS "latestReadingAt",
           COALESCE(exc.n, 0)::int  AS excursions,
           COALESCE(lots.n, 0)::int AS "lotsStored"
    FROM "Location" loc
    LEFT JOIN LATERAL (
      SELECT t."tempC", t."recordedAt" FROM "TemperatureReading" t
      WHERE t."locationId" = loc."locationId"
      ORDER BY t."recordedAt" DESC LIMIT 1
    ) latest ON true
    LEFT JOIN (
      SELECT "locationId", COUNT(*) AS n FROM "TemperatureReading"
      WHERE "isExcursion" AND "recordedAt" >= NOW() - (${days} || ' days')::interval
      GROUP BY "locationId"
    ) exc ON exc."locationId" = loc."locationId"
    LEFT JOIN (
      SELECT "locationId", COUNT(*) AS n FROM "Lot"
      WHERE "quantityRemaining" > 0 GROUP BY "locationId"
    ) lots ON lots."locationId" = loc."locationId"
    WHERE loc."isActive"
    ORDER BY excursions DESC, loc.name`;
}

/** Top sellers by revenue. */
async function getTopProducts(days: number, limit: number) {
  return prisma.$queryRaw<
    { productId: string; sku: string; name: string; units: number; revenue: number }[]
  >`
    SELECT p."productId", p.sku, p.name,
           SUM(-m.quantity)::int AS units,
           SUM(-m.quantity * m."unitValue")::float AS revenue
    FROM "StockMovement" m
    JOIN "Lot" l     ON l."lotId" = m."lotId"
    JOIN "Product" p ON p."productId" = l."productId"
    WHERE m.type = 'SALE' AND m."occurredAt" >= NOW() - (${days} || ' days')::interval
    GROUP BY p."productId", p.sku, p.name
    ORDER BY revenue DESC
    LIMIT ${limit}`;
}

async function getExpenseBreakdown(days: number) {
  return prisma.$queryRaw<{ category: string; amount: number }[]>`
    SELECT category, SUM(amount)::float AS amount
    FROM "Expense"
    WHERE "incurredAt" >= NOW() - (${days} || ' days')::interval
    GROUP BY category ORDER BY amount DESC`;
}

// ---------------------------------------------------------------------------

export type DashboardOptions = {
  periodDays?: number;
  trendDays?: number;
  atRiskDays?: number;
};

/**
 * One payload for the whole dashboard. Queries run concurrently -- they are
 * independent, so awaiting them in sequence would just add up their latencies
 * for no reason.
 */
export async function getDashboard(opts: DashboardOptions = {}) {
  const periodDays = opts.periodDays ?? 30;
  const trendDays = opts.trendDays ?? 90;
  const atRiskDays = opts.atRiskDays ?? 7;

  const [
    stock, totals, series, wasteByReason, worstWaste,
    expiring, reorder, coldChain, topProducts, expenses,
  ] = await Promise.all([
    getStockPosition(atRiskDays),
    getPeriodTotals(periodDays),
    getDailySeries(trendDays),
    getWasteByReason(periodDays),
    getWorstWasteProducts(periodDays, 8),
    getExpiringLots(atRiskDays, 25),
    getReorderList(15),
    getColdChainStatus(periodDays),
    getTopProducts(periodDays, 8),
    getExpenseBreakdown(periodDays),
  ]);

  const revenue = num(totals.revenue);
  const received = num(totals.received);
  const waste = num(totals.waste);
  const prevReceived = num(totals.prevReceived);

  // Waste rate is expressed against goods received, not revenue. Measuring it
  // against revenue would let a good sales month disguise a bad waste month.
  const wasteRate = received === 0 ? 0 : Number(((waste / received) * 100).toFixed(2));
  const prevWasteRate =
    prevReceived === 0 ? 0 : Number(((num(totals.prevWaste) / prevReceived) * 100).toFixed(2));

  return {
    meta: { periodDays, trendDays, atRiskDays, generatedAt: new Date() },
    kpis: {
      revenue: { value: revenue, changePct: pctChange(revenue, num(totals.prevRevenue)) },
      goodsReceived: { value: received, changePct: pctChange(received, prevReceived) },
      wasteCost: { value: waste, changePct: pctChange(waste, num(totals.prevWaste)) },
      wasteRatePct: { value: wasteRate, changePct: pctChange(wasteRate, prevWasteRate) },
      grossMargin: {
        value: revenue === 0 ? 0 : Number((((revenue - received) / revenue) * 100).toFixed(1)),
      },
      inventoryOnHand: { value: num(stock.onHandValue), units: num(stock.onHandUnits) },
      atRisk: {
        value: num(stock.atRiskValue),
        lots: num(stock.atRiskLots),
        pctOfInventory:
          num(stock.onHandValue) === 0
            ? 0
            : Number(((num(stock.atRiskValue) / num(stock.onHandValue)) * 100).toFixed(1)),
      },
      quarantinedValue: { value: num(stock.quarantinedValue) },
    },
    trend: series,
    wasteByReason,
    worstWasteProducts: worstWaste,
    expiringLots: expiring,
    reorderList: reorder,
    coldChain,
    topProducts,
    expenseBreakdown: expenses,
  };
}

export const dashboardQueries = {
  getStockPosition, getPeriodTotals, getDailySeries, getWasteByReason,
  getWorstWasteProducts, getExpiringLots, getReorderList, getColdChainStatus,
  getTopProducts, getExpenseBreakdown,
};
