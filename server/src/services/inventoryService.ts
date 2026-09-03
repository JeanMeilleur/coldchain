/**
 * Inventory service -- the business logic the tutorial had none of.
 *
 * Central idea: stock is not a number on a product row, it is a set of lots
 * each with its own expiration date. Selling means deciding WHICH lots to
 * draw from, and for perishables that decision is FEFO: First Expired,
 * First Out. Ship the carton that dies soonest, or you will throw it away.
 *
 * Every mutation here is transactional and appends to the StockMovement
 * ledger. Nothing edits a balance without leaving a record of why.
 */

import { MovementType, WasteReason, Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

/** Thrown when a sale asks for more units than are sellable right now. */
export class InsufficientStockError extends Error {
  constructor(
    public readonly productId: string,
    public readonly requested: number,
    public readonly available: number
  ) {
    super(
      `Insufficient stock for product ${productId}: requested ${requested}, ` +
        `only ${available} sellable`
    );
    this.name = "InsufficientStockError";
  }
}

type SellableLot = {
  lotId: string;
  quantityRemaining: number;
  expiresAt: Date;
  unitCost: number;
};

export type Allocation = {
  lotId: string;
  lotCode: string;
  quantity: number;
  expiresAt: Date;
  unitCost: number;
};

/**
 * Pick which lots fill an order, soonest-expiring first.
 *
 * Runs inside a caller-supplied transaction and takes `FOR UPDATE` row locks.
 * Without those locks two concurrent sales both read "10 remaining", both
 * decide they can take 10, and the lot ends up at -10. The lock makes the
 * second request wait for the first to commit, so it sees the real balance.
 *
 * Excluded from consideration:
 *   - lots already at zero
 *   - lots past their expiration date (expired stock is not sellable stock)
 *   - quarantined lots (held after a temperature excursion or recall)
 */
async function allocateFefo(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number
): Promise<{ lotId: string; take: number; unitCost: number }[]> {
  if (quantity <= 0) throw new Error("Quantity must be positive");

  const lots = await tx.$queryRaw<SellableLot[]>`
    SELECT "lotId", "quantityRemaining", "expiresAt", "unitCost"::float AS "unitCost"
    FROM "Lot"
    WHERE "productId" = ${productId}
      AND "quantityRemaining" > 0
      AND "isQuarantined" = false
      AND "expiresAt" > NOW()
    ORDER BY "expiresAt" ASC, "receivedAt" ASC
    FOR UPDATE`;

  const available = lots.reduce((sum, l) => sum + l.quantityRemaining, 0);
  if (available < quantity) {
    throw new InsufficientStockError(productId, quantity, available);
  }

  const plan: { lotId: string; take: number; unitCost: number }[] = [];
  let outstanding = quantity;
  for (const lot of lots) {
    if (outstanding <= 0) break;
    const take = Math.min(outstanding, lot.quantityRemaining);
    plan.push({ lotId: lot.lotId, take, unitCost: lot.unitCost });
    outstanding -= take;
  }
  return plan;
}

/**
 * Record a sale. Draws FEFO across however many lots it takes, writes one
 * SALE movement per lot touched, and decrements each lot in the same
 * transaction so balances and ledger can never diverge.
 */
export async function recordSale(params: {
  productId: string;
  quantity: number;
  unitPrice?: number;
  userId?: string;
  note?: string;
}) {
  const { productId, quantity, userId, note } = params;

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { productId } });
    if (!product) throw new Error(`Unknown product ${productId}`);

    const unitPrice = params.unitPrice ?? Number(product.unitPrice);
    const plan = await allocateFefo(tx, productId, quantity);
    const allocations: Allocation[] = [];

    for (const step of plan) {
      const lot = await tx.lot.update({
        where: { lotId: step.lotId },
        data: { quantityRemaining: { decrement: step.take } },
      });
      await tx.stockMovement.create({
        data: {
          lotId: step.lotId,
          type: MovementType.SALE,
          quantity: -step.take,
          unitValue: unitPrice,
          userId,
          note,
        },
      });
      allocations.push({
        lotId: lot.lotId,
        lotCode: lot.lotCode,
        quantity: step.take,
        expiresAt: lot.expiresAt,
        unitCost: step.unitCost,
      });
    }

    return {
      productId,
      quantity,
      unitPrice,
      revenue: Number((quantity * unitPrice).toFixed(2)),
      lotsUsed: allocations.length,
      allocations,
    };
  });
}

/**
 * Receive a delivery. Creates the lot and its opening RECEIPT movement
 * together, so a lot can never exist without the record that explains it.
 *
 * If no expiration date is supplied it is derived from the product's shelf
 * life -- but callers should pass the date printed on the case when they
 * have it, because suppliers ship short-dated product more often than
 * anyone would like.
 */
export async function receiveStock(params: {
  productId: string;
  lotCode: string;
  quantity: number;
  unitCost: number;
  expiresAt?: Date;
  locationId?: string;
  supplierId?: string;
  userId?: string;
}) {
  const { productId, lotCode, quantity, unitCost, userId } = params;
  if (quantity <= 0) throw new Error("Received quantity must be positive");

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { productId } });
    if (!product) throw new Error(`Unknown product ${productId}`);

    const expiresAt =
      params.expiresAt ??
      new Date(Date.now() + product.shelfLifeDays * 86400000);

    const lot = await tx.lot.create({
      data: {
        lotCode,
        productId,
        supplierId: params.supplierId ?? product.supplierId,
        locationId: params.locationId,
        expiresAt,
        quantityReceived: quantity,
        quantityRemaining: quantity,
        unitCost,
      },
    });

    await tx.stockMovement.create({
      data: {
        lotId: lot.lotId,
        type: MovementType.RECEIPT,
        quantity,
        unitValue: unitCost,
        userId,
        note: "Received from supplier",
      },
    });

    return lot;
  });
}

/** Write stock off a specific lot. Waste is always lot-specific -- you know
 *  exactly which carton you threw out. */
export async function recordWaste(params: {
  lotId: string;
  quantity: number;
  reason: WasteReason;
  userId?: string;
  note?: string;
}) {
  const { lotId, quantity, reason, userId, note } = params;
  if (quantity <= 0) throw new Error("Waste quantity must be positive");

  return prisma.$transaction(async (tx) => {
    const [lot] = await tx.$queryRaw<
      { lotId: string; quantityRemaining: number; unitCost: number }[]
    >`SELECT "lotId", "quantityRemaining", "unitCost"::float AS "unitCost"
      FROM "Lot" WHERE "lotId" = ${lotId} FOR UPDATE`;

    if (!lot) throw new Error(`Unknown lot ${lotId}`);
    if (lot.quantityRemaining < quantity) {
      throw new Error(
        `Cannot waste ${quantity}; lot ${lotId} holds ${lot.quantityRemaining}`
      );
    }

    await tx.lot.update({
      where: { lotId },
      data: { quantityRemaining: { decrement: quantity } },
    });

    return tx.stockMovement.create({
      data: {
        lotId,
        type: MovementType.WASTE,
        quantity: -quantity,
        unitValue: lot.unitCost,
        wasteReason: reason,
        userId,
        note,
      },
    });
  });
}

/**
 * Sweep every lot that has passed its expiration date but still shows stock,
 * and write it off as EXPIRED. This is what a nightly job would call.
 * Idempotent: a second run finds nothing left to do.
 */
export async function writeOffExpiredLots(userId?: string) {
  const expired = await prisma.lot.findMany({
    where: { expiresAt: { lte: new Date() }, quantityRemaining: { gt: 0 } },
    select: { lotId: true, quantityRemaining: true },
  });

  let unitsWritten = 0;
  for (const lot of expired) {
    await recordWaste({
      lotId: lot.lotId,
      quantity: lot.quantityRemaining,
      reason: WasteReason.EXPIRED,
      userId,
      note: "Automatic write-off: past expiration",
    });
    unitsWritten += lot.quantityRemaining;
  }
  return { lotsWrittenOff: expired.length, unitsWrittenOff: unitsWritten };
}

/** Quarantine every lot in a location -- used after a temperature excursion.
 *  Quarantined stock stops being sellable immediately but is not yet waste;
 *  someone has to inspect it and decide. */
export async function quarantineLocation(locationId: string, quarantined = true) {
  const result = await prisma.lot.updateMany({
    where: { locationId, quantityRemaining: { gt: 0 } },
    data: { isQuarantined: quarantined },
  });
  return { lotsAffected: result.count, quarantined };
}

/** Sellable units of a product right now: unexpired, unquarantined stock. */
export async function getOnHand(productId: string): Promise<number> {
  const result = await prisma.lot.aggregate({
    where: {
      productId,
      quantityRemaining: { gt: 0 },
      isQuarantined: false,
      expiresAt: { gt: new Date() },
    },
    _sum: { quantityRemaining: true },
  });
  return result._sum.quantityRemaining ?? 0;
}
