/**
 * FEFO allocation tests.
 *
 * Creates its own isolated product and lots, exercises the inventory service
 * against them, asserts the outcomes, then deletes everything it made. It
 * never reads or mutates seeded data, so it is safe to run any time.
 *
 * Run with: npm run test:fifo
 */

import { StorageZone, WasteReason } from "@prisma/client";
import prisma from "../src/lib/prisma";
import {
  recordSale,
  recordWaste,
  getOnHand,
  InsufficientStockError,
} from "../src/services/inventoryService";

const TAG = `TEST-${Date.now()}`;
let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${label}` +
      (ok ? "" : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  );
  ok ? passed++ : failed++;
}

const inDays = (n: number) => new Date(Date.now() + n * 86400000);

async function makeLot(
  productId: string,
  code: string,
  qty: number,
  expiresInDays: number,
  opts: { quarantined?: boolean; locationId?: string } = {}
) {
  return prisma.lot.create({
    data: {
      lotCode: `${TAG}-${code}`,
      productId,
      expiresAt: inDays(expiresInDays),
      quantityReceived: qty,
      quantityRemaining: qty,
      unitCost: 10,
      isQuarantined: opts.quarantined ?? false,
      locationId: opts.locationId,
    },
  });
}

async function main() {
  console.log(`\n=== FEFO allocation tests (${TAG}) ===\n`);

  const product = await prisma.product.create({
    data: {
      sku: `${TAG}-SKU`,
      name: "Test Product",
      unitPrice: 25,
      storageZone: StorageZone.REFRIGERATED,
      shelfLifeDays: 10,
      reorderPoint: 5,
    },
  });
  const pid = product.productId;

  // ---------------------------------------------------------------------
  console.log("1. sells soonest-expiring lot first, spanning multiple lots");
  const soon = await makeLot(pid, "A", 10, 2);   // expires in 2 days
  const mid = await makeLot(pid, "B", 10, 5);    // expires in 5 days
  const late = await makeLot(pid, "C", 10, 10);  // expires in 10 days

  const sale = await recordSale({ productId: pid, quantity: 25 });

  check("drew from 3 lots", sale.lotsUsed, 3);
  check(
    "allocation order was by expiry",
    sale.allocations.map((a) => a.quantity),
    [10, 10, 5]
  );
  check(
    "soonest-expiring lot emptied",
    (await prisma.lot.findUnique({ where: { lotId: soon.lotId } }))!.quantityRemaining,
    0
  );
  check(
    "middle lot emptied",
    (await prisma.lot.findUnique({ where: { lotId: mid.lotId } }))!.quantityRemaining,
    0
  );
  check(
    "furthest-out lot only partly drawn",
    (await prisma.lot.findUnique({ where: { lotId: late.lotId } }))!.quantityRemaining,
    5
  );

  // ---------------------------------------------------------------------
  console.log("\n2. ledger matches balances after the sale");
  const ledger = await prisma.$queryRaw<{ lotId: string; sum: number }[]>`
    SELECT m."lotId", SUM(m.quantity)::int AS sum
    FROM "StockMovement" m
    JOIN "Lot" l ON l."lotId" = m."lotId"
    WHERE l."productId" = ${pid}
    GROUP BY m."lotId"`;
  // Fixtures were inserted directly without RECEIPT rows, so each lot's
  // ledger holds only its SALE rows. Balance + units sold must equal the
  // original 10 for every lot touched.
  const lots = await prisma.lot.findMany({ where: { productId: pid } });
  const consistent = lots.every((l) => {
    const sold = -(ledger.find((x) => x.lotId === l.lotId)?.sum ?? 0);
    return l.quantityRemaining + sold === l.quantityReceived;
  });
  check("every lot: remaining + sold === received", consistent, true);

  // ---------------------------------------------------------------------
  console.log("\n3. refuses to oversell");
  let threw: string | null = null;
  try {
    await recordSale({ productId: pid, quantity: 999 });
  } catch (e) {
    threw = e instanceof InsufficientStockError ? "InsufficientStockError" : "WrongError";
  }
  check("threw InsufficientStockError", threw, "InsufficientStockError");
  check(
    "failed sale changed nothing",
    (await prisma.lot.findUnique({ where: { lotId: late.lotId } }))!.quantityRemaining,
    5
  );

  // ---------------------------------------------------------------------
  console.log("\n4. skips expired stock");
  const expired = await makeLot(pid, "D", 50, -3); // expired 3 days ago
  check("expired stock excluded from on-hand", await getOnHand(pid), 5);
  let expiredThrew = false;
  try {
    await recordSale({ productId: pid, quantity: 20 }); // 5 fresh + 50 expired
  } catch (e) {
    expiredThrew = e instanceof InsufficientStockError;
  }
  check("cannot sell expired stock", expiredThrew, true);
  check(
    "expired lot untouched",
    (await prisma.lot.findUnique({ where: { lotId: expired.lotId } }))!.quantityRemaining,
    50
  );

  // ---------------------------------------------------------------------
  console.log("\n5. skips quarantined stock");
  const quarantined = await makeLot(pid, "E", 30, 8, { quarantined: true });
  check("quarantined stock excluded from on-hand", await getOnHand(pid), 5);
  let quarThrew = false;
  try {
    await recordSale({ productId: pid, quantity: 20 });
  } catch (e) {
    quarThrew = e instanceof InsufficientStockError;
  }
  check("cannot sell quarantined stock", quarThrew, true);

  // ---------------------------------------------------------------------
  console.log("\n6. waste writes down the lot and logs a reason");
  await recordWaste({
    lotId: late.lotId,
    quantity: 2,
    reason: WasteReason.DAMAGED,
    note: "crushed case",
  });
  check(
    "lot decremented by waste",
    (await prisma.lot.findUnique({ where: { lotId: late.lotId } }))!.quantityRemaining,
    3
  );
  const wasteRows = await prisma.stockMovement.findMany({
    where: { lotId: late.lotId, type: "WASTE" },
  });
  check("one WASTE movement written", wasteRows.length, 1);
  check("reason recorded", wasteRows[0].wasteReason, "DAMAGED");
  check("waste quantity is negative", wasteRows[0].quantity, -2);

  let overWaste = false;
  try {
    await recordWaste({ lotId: late.lotId, quantity: 999, reason: WasteReason.DAMAGED });
  } catch {
    overWaste = true;
  }
  check("cannot waste more than the lot holds", overWaste, true);

  // ---------------------------------------------------------------------
  console.log("\n=== cleanup ===");
  await prisma.stockMovement.deleteMany({ where: { lot: { productId: pid } } });
  await prisma.lot.deleteMany({ where: { productId: pid } });
  await prisma.product.delete({ where: { productId: pid } });
  const leftover = await prisma.product.count({ where: { sku: { startsWith: TAG } } });
  check("test fixtures removed", leftover, 0);

  console.log(
    `\n${passed} passed, ${failed} failed\n` +
      (failed === 0 ? "FEFO logic verified.\n" : "SOME TESTS FAILED.\n")
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
