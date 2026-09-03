/**
 * ColdChain seed
 *
 * Generates an internally consistent 120-day operating history for a
 * perishable-goods distributor. "Consistent" is the important word:
 * every lot's quantityRemaining is the arithmetic result of replaying its
 * own movement ledger, so the dashboard aggregates and the lot balances
 * can never disagree. Nothing here is a hardcoded summary figure.
 */

import {
  PrismaClient,
  StorageZone,
  MovementType,
  WasteReason,
  UserRole,
} from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

// --- deterministic randomness -------------------------------------------
// Seeded so every run produces the same database. Reproducible demos matter
// when you are showing this to someone.
let seedState = 20260929;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

// --- dates ---------------------------------------------------------------
const NOW = new Date();
const HISTORY_DAYS = 120;
const daysFrom = (base: Date, days: number) =>
  new Date(base.getTime() + days * 86400000);
const daysAgo = (days: number) => daysFrom(NOW, -days);

// --- password hashing (node built-in, no extra dependency) ---------------
function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// -------------------------------------------------------------------------
// Reference data
// -------------------------------------------------------------------------

const CATEGORIES = [
  "Poultry",
  "Seafood",
  "Dairy",
  "Produce",
  "Frozen Prepared",
  "Dry Goods",
];

// Each supplier serves specific categories. A seafood wholesaler does not
// deliver flour, and assigning suppliers at random produces nonsense like
// "Roma Tomatoes -- supplied by Gulfstream Seafood Co." that undermines the
// supplier scorecard.
const SUPPLIERS = [
  {
    name: "Biscayne Cold Foods",
    leadTimeDays: 2,
    email: "orders@biscaynecold.example",
    categories: ["Poultry", "Frozen Prepared"],
  },
  {
    name: "Gulfstream Seafood Co.",
    leadTimeDays: 3,
    email: "sales@gulfstreamseafood.example",
    categories: ["Seafood"],
  },
  {
    name: "Everglade Dairy Supply",
    leadTimeDays: 1,
    email: "dispatch@evergladedairy.example",
    categories: ["Dairy"],
  },
  {
    name: "Redland Produce Partners",
    leadTimeDays: 1,
    email: "hello@redlandproduce.example",
    categories: ["Produce"],
  },
  {
    name: "Atlantic Dry Goods",
    leadTimeDays: 5,
    email: "ap@atlanticdry.example",
    categories: ["Dry Goods"],
  },
];

const LOCATIONS = [
  { name: "Walk-in Freezer A", zone: StorageZone.FROZEN, targetTempC: -18, toleranceC: 3 },
  { name: "Walk-in Freezer B", zone: StorageZone.FROZEN, targetTempC: -18, toleranceC: 3 },
  { name: "Cooler 1 - Proteins", zone: StorageZone.REFRIGERATED, targetTempC: 2, toleranceC: 2 },
  { name: "Cooler 2 - Dairy & Produce", zone: StorageZone.REFRIGERATED, targetTempC: 3, toleranceC: 2 },
  { name: "Dry Storage", zone: StorageZone.AMBIENT, targetTempC: null, toleranceC: 5 },
];

type ProductSeed = {
  sku: string;
  name: string;
  category: string;
  zone: StorageZone;
  unit: string;
  unitPrice: number;
  shelfLifeDays: number;
  reorderPoint: number;
  dailyDemand: number; // average units sold per day
};

const PRODUCTS: ProductSeed[] = [
  // FROZEN - long shelf life, rarely the waste problem
  { sku: "FRZ-1001", name: "Chicken Breast, Boneless (frozen)", category: "Poultry", zone: StorageZone.FROZEN, unit: "case", unitPrice: 82.5, shelfLifeDays: 270, reorderPoint: 12, dailyDemand: 6 },
  { sku: "FRZ-1002", name: "Shrimp 21/25 ct (frozen)", category: "Seafood", zone: StorageZone.FROZEN, unit: "case", unitPrice: 148.0, shelfLifeDays: 300, reorderPoint: 8, dailyDemand: 3 },
  { sku: "FRZ-1003", name: "Salmon Fillet, Atlantic (frozen)", category: "Seafood", zone: StorageZone.FROZEN, unit: "case", unitPrice: 176.25, shelfLifeDays: 240, reorderPoint: 6, dailyDemand: 2 },
  { sku: "FRZ-1004", name: "Beef Patties 4oz (frozen)", category: "Frozen Prepared", zone: StorageZone.FROZEN, unit: "case", unitPrice: 94.0, shelfLifeDays: 210, reorderPoint: 10, dailyDemand: 5 },
  { sku: "FRZ-1005", name: "French Fries, Shoestring", category: "Frozen Prepared", zone: StorageZone.FROZEN, unit: "case", unitPrice: 38.75, shelfLifeDays: 365, reorderPoint: 15, dailyDemand: 8 },
  { sku: "FRZ-1006", name: "Sweet Corn, Cut (frozen)", category: "Frozen Prepared", zone: StorageZone.FROZEN, unit: "case", unitPrice: 29.5, shelfLifeDays: 365, reorderPoint: 10, dailyDemand: 4 },

  // REFRIGERATED - short shelf life, this is where waste happens
  { sku: "REF-2001", name: "Whole Milk, 1 gal", category: "Dairy", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 26.4, shelfLifeDays: 14, reorderPoint: 20, dailyDemand: 12 },
  { sku: "REF-2002", name: "Heavy Cream, 1 qt", category: "Dairy", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 41.8, shelfLifeDays: 18, reorderPoint: 12, dailyDemand: 6 },
  { sku: "REF-2003", name: "Butter, Unsalted 1 lb", category: "Dairy", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 68.0, shelfLifeDays: 45, reorderPoint: 10, dailyDemand: 4 },
  { sku: "REF-2004", name: "Mozzarella, Shredded 5 lb", category: "Dairy", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 57.25, shelfLifeDays: 30, reorderPoint: 12, dailyDemand: 5 },
  { sku: "REF-2005", name: "Greek Yogurt, Plain 32 oz", category: "Dairy", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 34.9, shelfLifeDays: 21, reorderPoint: 10, dailyDemand: 5 },
  { sku: "REF-2006", name: "Chicken Breast, Fresh", category: "Poultry", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 96.0, shelfLifeDays: 7, reorderPoint: 14, dailyDemand: 9 },
  { sku: "REF-2007", name: "Ground Beef 80/20", category: "Poultry", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 112.5, shelfLifeDays: 6, reorderPoint: 12, dailyDemand: 8 },
  { sku: "REF-2008", name: "Salmon Fillet, Fresh", category: "Seafood", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 205.0, shelfLifeDays: 4, reorderPoint: 6, dailyDemand: 4 },
  { sku: "REF-2009", name: "Romaine Hearts, 12 ct", category: "Produce", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 31.5, shelfLifeDays: 8, reorderPoint: 15, dailyDemand: 10 },
  { sku: "REF-2010", name: "Roma Tomatoes, 25 lb", category: "Produce", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 27.75, shelfLifeDays: 10, reorderPoint: 12, dailyDemand: 7 },
  { sku: "REF-2011", name: "Spring Mix, 3 lb", category: "Produce", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 22.4, shelfLifeDays: 5, reorderPoint: 10, dailyDemand: 8 },
  { sku: "REF-2012", name: "Large Eggs, 15 doz", category: "Dairy", zone: StorageZone.REFRIGERATED, unit: "case", unitPrice: 58.9, shelfLifeDays: 24, reorderPoint: 14, dailyDemand: 7 },

  // AMBIENT - very long shelf life, effectively never expires in this window
  { sku: "DRY-3001", name: "All-Purpose Flour, 50 lb", category: "Dry Goods", zone: StorageZone.AMBIENT, unit: "bag", unitPrice: 24.0, shelfLifeDays: 300, reorderPoint: 8, dailyDemand: 3 },
  { sku: "DRY-3002", name: "Granulated Sugar, 50 lb", category: "Dry Goods", zone: StorageZone.AMBIENT, unit: "bag", unitPrice: 31.2, shelfLifeDays: 540, reorderPoint: 8, dailyDemand: 2 },
  { sku: "DRY-3003", name: "Olive Oil, 3 L", category: "Dry Goods", zone: StorageZone.AMBIENT, unit: "case", unitPrice: 72.6, shelfLifeDays: 420, reorderPoint: 6, dailyDemand: 2 },
  { sku: "DRY-3004", name: "Crushed Tomatoes, #10 can", category: "Dry Goods", zone: StorageZone.AMBIENT, unit: "case", unitPrice: 39.5, shelfLifeDays: 600, reorderPoint: 10, dailyDemand: 4 },
  { sku: "DRY-3005", name: "Long Grain Rice, 25 lb", category: "Dry Goods", zone: StorageZone.AMBIENT, unit: "bag", unitPrice: 28.8, shelfLifeDays: 540, reorderPoint: 8, dailyDemand: 3 },
];

const EXPENSE_CATEGORIES = [
  { category: "Refrigeration Power", min: 380, max: 720 },
  { category: "Labor", min: 1800, max: 2600 },
  { category: "Delivery Fuel", min: 220, max: 480 },
  { category: "Equipment Maintenance", min: 0, max: 900 },
  { category: "Packaging", min: 90, max: 260 },
  { category: "Sanitation & Compliance", min: 120, max: 340 },
];

// -------------------------------------------------------------------------
// Seed
// -------------------------------------------------------------------------

async function main() {
  console.log("Clearing existing data...");
  // Delete in FK-safe order: children before parents.
  await prisma.stockMovement.deleteMany();
  await prisma.temperatureReading.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.product.deleteMany();
  await prisma.location.deleteMany();
  await prisma.category.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.expense.deleteMany();

  // --- users -------------------------------------------------------------
  console.log("Seeding users...");
  const users = await Promise.all(
    [
      { email: "admin@coldchain.example", name: "Dana Whitfield", role: UserRole.ADMIN },
      { email: "manager@coldchain.example", name: "Marcus Leon", role: UserRole.MANAGER },
      { email: "receiving@coldchain.example", name: "Priya Raman", role: UserRole.STAFF },
      { email: "floor@coldchain.example", name: "Tomas Vieira", role: UserRole.STAFF },
    ].map((u) =>
      prisma.user.create({
        data: { ...u, passwordHash: hashPassword("ColdChain!2026") },
      })
    )
  );
  const staff = users.filter((u) => u.role !== UserRole.ADMIN);

  // --- categories, suppliers, locations -----------------------------------
  console.log("Seeding categories, suppliers, locations...");
  const categories = await Promise.all(
    CATEGORIES.map((name) => prisma.category.create({ data: { name } }))
  );
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  const suppliers = await Promise.all(
    SUPPLIERS.map((s) =>
      prisma.supplier.create({
        data: {
          name: s.name,
          contactEmail: s.email,
          leadTimeDays: s.leadTimeDays,
        },
      })
    )
  );
  // category name -> the suppliers who actually carry that category
  const suppliersForCategory = new Map<string, typeof suppliers>();
  for (const spec of SUPPLIERS) {
    const record = suppliers.find((x) => x.name === spec.name)!;
    for (const cat of spec.categories) {
      if (!suppliersForCategory.has(cat)) suppliersForCategory.set(cat, []);
      suppliersForCategory.get(cat)!.push(record);
    }
  }

  const locations = await Promise.all(
    LOCATIONS.map((l) => prisma.location.create({ data: l }))
  );
  const locationsByZone = (zone: StorageZone) =>
    locations.filter((l) => l.zone === zone);

  // --- products ------------------------------------------------------------
  console.log("Seeding products...");
  const products = await Promise.all(
    PRODUCTS.map((p) =>
      prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          unitPrice: p.unitPrice,
          storageZone: p.zone,
          shelfLifeDays: p.shelfLifeDays,
          reorderPoint: p.reorderPoint,
          categoryId: categoryByName.get(p.category)!.categoryId,
          supplierId: pick(suppliersForCategory.get(p.category) ?? suppliers).supplierId,
        },
      })
    )
  );
  const productSeedBySku = new Map(PRODUCTS.map((p) => [p.sku, p]));

  // --- lots + movement ledger ---------------------------------------------
  // Strategy: walk forward through history. Each product receives a lot
  // whenever its on-hand would otherwise run dry, and sells roughly its
  // daily demand. Sales draw FIFO -- soonest expiry first -- which is the
  // same rule the application enforces at runtime. Anything still on hand
  // past its expiry becomes a WASTE movement on the day it expired.
  console.log("Seeding lots, sales, waste (this is the slow part)...");

  type LotState = {
    lotId: string;
    expiresAt: Date;
    remaining: number;
    unitCost: number;
  };

  const movementRows: any[] = [];
  let lotCounter = 1000;

  for (const product of products) {
    const spec = productSeedBySku.get(product.sku)!;
    const zoneLocations = locationsByZone(spec.zone);
    const openLots: LotState[] = [];

    // Demand is not flat. Real operations have slow weeks and busy weeks, and
    // buying for an average week then hitting a slow one is the single biggest
    // cause of food waste. Cache one factor per week so a slow week is
    // genuinely a slow week, not just daily noise.
    const weekFactors = new Map<number, number>();
    const weekFactor = (d: number) => {
      const w = Math.floor(d / 7);
      if (!weekFactors.has(w)) weekFactors.set(w, 0.6 + rand() * 0.8);
      return weekFactors.get(w)!;
    };

    for (let day = HISTORY_DAYS; day >= 0; day--) {
      const date = daysAgo(day);

      // Receive stock when we would otherwise run out within a couple days.
      const onHand = openLots.reduce((sum, l) => sum + l.remaining, 0);
      const needsReceipt = onHand <= spec.dailyDemand * 2;

      if (needsReceipt) {
        // Buyers order to cover about half the shelf life, capped so long-life
        // dry goods do not arrive in absurd quantities -- and they round up,
        // because running out costs a customer while over-ordering only costs
        // margin. That asymmetry is exactly why perishable waste exists.
        const coverDays = Math.min(Math.ceil(spec.shelfLifeDays * 0.5), 21);
        const qty = Math.max(
          spec.reorderPoint,
          Math.ceil(spec.dailyDemand * coverDays * (1.0 + rand() * 0.5))
        );
        const unitCost = round2(spec.unitPrice * (0.58 + rand() * 0.12));

        // Roughly one delivery in eight arrives already partway through its
        // shelf life -- it sat on the supplier's dock or in transit. Receiving
        // clerks log the printed date, so the lot is short-dated from day one.
        const shortDated = rand() < 0.13;
        const effectiveShelfDays = shortDated
          ? Math.max(1, Math.round(spec.shelfLifeDays * (0.35 + rand() * 0.3)))
          : spec.shelfLifeDays;
        const expiresAt = daysFrom(date, effectiveShelfDays);

        const lot = await prisma.lot.create({
          data: {
            lotCode: `L${++lotCounter}-${product.sku.slice(-4)}`,
            productId: product.productId,
            supplierId: product.supplierId,
            locationId: pick(zoneLocations).locationId,
            receivedAt: date,
            expiresAt,
            quantityReceived: qty,
            quantityRemaining: qty, // corrected after the ledger is replayed
            unitCost,
          },
        });

        openLots.push({
          lotId: lot.lotId,
          expiresAt,
          remaining: qty,
          unitCost,
        });

        movementRows.push({
          lotId: lot.lotId,
          type: MovementType.RECEIPT,
          quantity: qty,
          unitValue: unitCost,
          userId: pick(staff).userId,
          occurredAt: date,
          note: "Received from supplier",
        });
      }

      // Write off anything that expired on or before today.
      for (const lot of openLots) {
        if (lot.remaining > 0 && lot.expiresAt <= date) {
          movementRows.push({
            lotId: lot.lotId,
            type: MovementType.WASTE,
            quantity: -lot.remaining,
            unitValue: lot.unitCost,
            wasteReason: WasteReason.EXPIRED,
            userId: pick(staff).userId,
            occurredAt: date,
            note: "Expired on shelf",
          });
          lot.remaining = 0;
        }
      }

      // Sell, drawing FIFO by soonest expiry.
      const weekday = date.getDay();
      const weekendLift = weekday === 5 || weekday === 6 ? 1.35 : 1.0;
      let toSell = Math.max(
        0,
        Math.round(
          spec.dailyDemand * weekendLift * weekFactor(day) * (0.7 + rand() * 0.6)
        )
      );

      const sellable = openLots
        .filter((l) => l.remaining > 0 && l.expiresAt > date)
        .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

      for (const lot of sellable) {
        if (toSell <= 0) break;
        const take = Math.min(toSell, lot.remaining);
        lot.remaining -= take;
        toSell -= take;
        movementRows.push({
          lotId: lot.lotId,
          type: MovementType.SALE,
          quantity: -take,
          unitValue: spec.unitPrice,
          userId: pick(staff).userId,
          occurredAt: date,
        });
      }

      // Occasional damage in cold storage.
      if (rand() < 0.012 && sellable.length > 0) {
        const lot = pick(sellable);
        if (lot.remaining > 0) {
          const dmg = Math.min(lot.remaining, randInt(1, 2));
          lot.remaining -= dmg;
          movementRows.push({
            lotId: lot.lotId,
            type: MovementType.WASTE,
            quantity: -dmg,
            unitValue: lot.unitCost,
            wasteReason: pick([WasteReason.DAMAGED, WasteReason.TEMPERATURE_EXCURSION]),
            userId: pick(staff).userId,
            occurredAt: date,
            note: "Flagged during cold-storage inspection",
          });
        }
      }
    }

    // Persist the true remaining balance for each lot.
    for (const lot of openLots) {
      await prisma.lot.update({
        where: { lotId: lot.lotId },
        data: { quantityRemaining: lot.remaining },
      });
    }
  }

  console.log(`Writing ${movementRows.length} stock movements...`);
  for (let i = 0; i < movementRows.length; i += 500) {
    await prisma.stockMovement.createMany({ data: movementRows.slice(i, i + 500) });
  }

  // --- temperature readings ------------------------------------------------
  // Four readings a day per cold location, plus a handful of genuine
  // excursion events so the compliance view has something real to show.
  console.log("Seeding temperature readings...");
  const coldLocations = locations.filter((l) => l.targetTempC !== null);
  const readings: any[] = [];

  for (const loc of coldLocations) {
    const target = loc.targetTempC!;
    const tolerance = loc.toleranceC;
    // Pick a couple of days where this unit misbehaved.
    const badDays = new Set([randInt(4, 40), randInt(41, 100)]);

    for (let day = HISTORY_DAYS; day >= 0; day--) {
      const isBadDay = badDays.has(day);
      for (const hour of [2, 8, 14, 20]) {
        const at = new Date(daysAgo(day).setHours(hour, 0, 0, 0));
        let tempC: number;
        if (isBadDay && hour >= 8 && hour <= 14) {
          // Door left open / compressor struggling.
          tempC = round2(target + tolerance + 1 + rand() * 4);
        } else {
          tempC = round2(target + (rand() - 0.5) * tolerance * 1.2);
        }
        readings.push({
          locationId: loc.locationId,
          tempC,
          isExcursion: Math.abs(tempC - target) > tolerance,
          recordedAt: at,
        });
      }
    }
  }
  for (let i = 0; i < readings.length; i += 500) {
    await prisma.temperatureReading.createMany({ data: readings.slice(i, i + 500) });
  }

  // --- expenses ------------------------------------------------------------
  console.log("Seeding expenses...");
  const expenses: any[] = [];
  for (let day = HISTORY_DAYS; day >= 0; day--) {
    const date = daysAgo(day);
    for (const ec of EXPENSE_CATEGORIES) {
      // Maintenance is sporadic; everything else is daily.
      if (ec.category === "Equipment Maintenance" && rand() > 0.12) continue;
      const amount = round2(ec.min + rand() * (ec.max - ec.min));
      if (amount <= 0) continue;
      expenses.push({ category: ec.category, amount, incurredAt: date });
    }
  }
  for (let i = 0; i < expenses.length; i += 500) {
    await prisma.expense.createMany({ data: expenses.slice(i, i + 500) });
  }

  // --- summary -------------------------------------------------------------
  const [lotCount, movementCount, readingCount, excursionCount] = await Promise.all([
    prisma.lot.count(),
    prisma.stockMovement.count(),
    prisma.temperatureReading.count(),
    prisma.temperatureReading.count({ where: { isExcursion: true } }),
  ]);

  console.log("\n--- seed complete ---");
  console.log(`users:        ${users.length}`);
  console.log(`suppliers:    ${suppliers.length}`);
  console.log(`locations:    ${locations.length}`);
  console.log(`products:     ${products.length}`);
  console.log(`lots:         ${lotCount}`);
  console.log(`movements:    ${movementCount}`);
  console.log(`temp reads:   ${readingCount} (${excursionCount} excursions)`);
  console.log(`expenses:     ${expenses.length}`);
  console.log(`\nlogin: admin@coldchain.example / ColdChain!2026`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
