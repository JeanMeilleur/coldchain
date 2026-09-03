/**
 * Data integrity check.
 *
 * The core invariant of this system: a lot's quantityRemaining must equal
 * the sum of its own movement ledger. If those two ever disagree, the
 * dashboard is lying and every downstream number is suspect.
 *
 * Run with: npm run verify
 * Exits non-zero on any violation, so it can gate a commit or a CI run.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

type LotCheck = {
  lotId: string;
  quantityRemaining: number;
  expiresAt: Date;
  ledgerSum: number;
};

async function main() {
  let failures = 0;
  const fail = (msg: string) => {
    console.log(`  FAIL  ${msg}`);
    failures++;
  };
  const pass = (msg: string) => console.log(`  ok    ${msg}`);

  console.log("\n=== invariants ===");

  const lots = await prisma.$queryRaw<LotCheck[]>`
    SELECT l."lotId",
           l."quantityRemaining",
           l."expiresAt",
           COALESCE(SUM(m.quantity), 0)::int AS "ledgerSum"
    FROM "Lot" l
    LEFT JOIN "StockMovement" m ON m."lotId" = l."lotId"
    GROUP BY l."lotId", l."quantityRemaining", l."expiresAt"`;

  const mismatched = lots.filter((l) => l.quantityRemaining !== l.ledgerSum);
  mismatched.length
    ? fail(`${mismatched.length}/${lots.length} lots disagree with their ledger`)
    : pass(`all ${lots.length} lot balances match their movement ledger`);

  const negative = lots.filter((l) => l.quantityRemaining < 0);
  negative.length
    ? fail(`${negative.length} lots hold negative stock`)
    : pass("no negative stock balances");

  const now = new Date();
  const zombie = lots.filter((l) => l.expiresAt <= now && l.quantityRemaining > 0);
  zombie.length
    ? fail(`${zombie.length} expired lots still counted as sellable stock`)
    : pass("no expired lot is still holding sellable stock");

  const orphanMovements = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "StockMovement" m
    LEFT JOIN "Lot" l ON l."lotId" = m."lotId" WHERE l."lotId" IS NULL`;
  orphanMovements[0].n > 0
    ? fail(`${orphanMovements[0].n} movements reference a missing lot`)
    : pass("no orphaned stock movements");

  const badSign = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "StockMovement"
    WHERE (type = 'RECEIPT' AND quantity <= 0)
       OR (type IN ('SALE','WASTE') AND quantity >= 0)`;
  badSign[0].n > 0
    ? fail(`${badSign[0].n} movements have a quantity sign that contradicts their type`)
    : pass("movement quantity signs are consistent with their type");

  // --- business picture, computed live from the ledger --------------------
  console.log("\n=== 120-day picture (aggregated from the ledger) ===");

  const [agg] = await prisma.$queryRaw<
    { revenue: number; cogs: number; waste: number }[]
  >`
    SELECT
      COALESCE(SUM(CASE WHEN type='SALE'    THEN -quantity * "unitValue" END), 0)::float AS revenue,
      COALESCE(SUM(CASE WHEN type='RECEIPT' THEN  quantity * "unitValue" END), 0)::float AS cogs,
      COALESCE(SUM(CASE WHEN type='WASTE'   THEN -quantity * "unitValue" END), 0)::float AS waste
    FROM "StockMovement"`;

  const [stock] = await prisma.$queryRaw<{ onHand: number; atRisk: number }[]>`
    SELECT
      COALESCE(SUM("quantityRemaining" * "unitCost"), 0)::float AS "onHand",
      COALESCE(SUM(CASE WHEN "expiresAt" BETWEEN NOW() AND NOW() + INTERVAL '7 days'
                        THEN "quantityRemaining" * "unitCost" END), 0)::float AS "atRisk"
    FROM "Lot" WHERE "quantityRemaining" > 0`;

  console.log(`  revenue              ${money(agg.revenue)}`);
  console.log(`  goods received       ${money(agg.cogs)}`);
  console.log(`  waste written off    ${money(agg.waste)}  (${((agg.waste / agg.cogs) * 100).toFixed(1)}% of receipts)`);
  console.log(`  inventory on hand    ${money(stock.onHand)}`);
  console.log(`  expiring in 7 days   ${money(stock.atRisk)}`);

  const worst = await prisma.$queryRaw<
    { name: string; units: number; cost: number }[]
  >`
    SELECT p.name,
           SUM(-m.quantity)::int AS units,
           SUM(-m.quantity * m."unitValue")::float AS cost
    FROM "StockMovement" m
    JOIN "Lot" l ON l."lotId" = m."lotId"
    JOIN "Product" p ON p."productId" = l."productId"
    WHERE m.type = 'WASTE'
    GROUP BY p.name
    ORDER BY cost DESC
    LIMIT 5`;

  console.log("\n  worst products by waste cost:");
  worst.forEach((w) =>
    console.log(`    ${w.name.padEnd(38)} ${String(w.units).padStart(4)} u  ${money(w.cost)}`)
  );

  const excursions = await prisma.$queryRaw<{ name: string; n: number }[]>`
    SELECT l.name, COUNT(*)::int AS n
    FROM "TemperatureReading" t
    JOIN "Location" l ON l."locationId" = t."locationId"
    WHERE t."isExcursion" = true
    GROUP BY l.name ORDER BY n DESC`;
  console.log("\n  temperature excursions by location:");
  excursions.forEach((e) => console.log(`    ${e.name.padEnd(30)} ${e.n}`));

  console.log(
    failures === 0
      ? "\nAll invariants hold.\n"
      : `\n${failures} invariant(s) VIOLATED.\n`
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
