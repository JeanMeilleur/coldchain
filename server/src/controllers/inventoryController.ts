import { Request, Response, NextFunction } from "express";
import { WasteReason } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  recordSale, receiveStock, recordWaste, writeOffExpiredLots,
  quarantineLocation, InsufficientStockError,
} from "../services/inventoryService";
import { dashboardQueries } from "../services/dashboardService";
import { serialize } from "../lib/serialize";

export const getLots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lots = await prisma.lot.findMany({
      where: {
        quantityRemaining: { gt: 0 },
        productId: req.query.productId?.toString(),
      },
      orderBy: { expiresAt: "asc" },
      include: {
        product: { select: { sku: true, name: true, storageZone: true } },
        location: { select: { name: true, zone: true } },
        supplier: { select: { name: true } },
      },
      take: Math.min(Number(req.query.limit) || 200, 500),
    });
    res.json(serialize(lots));
  } catch (err) { next(err); }
};

export const getExpiring = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    res.json(await dashboardQueries.getExpiringLots(days, 200));
  } catch (err) { next(err); }
};

export const getMovements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      where: { type: req.query.type as any, lotId: req.query.lotId?.toString() },
      orderBy: { occurredAt: "desc" },
      take: Math.min(Number(req.query.limit) || 100, 500),
      include: {
        lot: { include: { product: { select: { sku: true, name: true } } } },
        user: { select: { name: true } },
      },
    });
    res.json(serialize(movements));
  } catch (err) { next(err); }
};

export const postSale = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) {
      res.status(400).json({ message: "productId and quantity are required" });
      return;
    }
    res.status(201).json(
      await recordSale({
        productId,
        quantity: Number(quantity),
        unitPrice: req.body.unitPrice != null ? Number(req.body.unitPrice) : undefined,
        userId: req.body.userId,
        note: req.body.note,
      })
    );
  } catch (err) {
    // A rejected sale is the caller asking for too much, not a server fault.
    if (err instanceof InsufficientStockError) {
      res.status(409).json({
        message: err.message,
        requested: err.requested,
        available: err.available,
      });
      return;
    }
    next(err);
  }
};

export const postReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, lotCode, quantity, unitCost } = req.body;
    if (!productId || !lotCode || !quantity || unitCost == null) {
      res.status(400).json({
        message: "productId, lotCode, quantity and unitCost are required",
      });
      return;
    }
    res.status(201).json(
      serialize(await receiveStock({
        productId, lotCode,
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
        locationId: req.body.locationId,
        supplierId: req.body.supplierId,
        userId: req.body.userId,
      }))
    );
  } catch (err) { next(err); }
};

export const postWaste = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lotId, quantity, reason } = req.body;
    if (!lotId || !quantity || !reason) {
      res.status(400).json({ message: "lotId, quantity and reason are required" });
      return;
    }
    if (!Object.values(WasteReason).includes(reason)) {
      res.status(400).json({
        message: `reason must be one of: ${Object.values(WasteReason).join(", ")}`,
      });
      return;
    }
    res.status(201).json(
      serialize(await recordWaste({
        lotId, quantity: Number(quantity), reason,
        userId: req.body.userId, note: req.body.note,
      }))
    );
  } catch (err) { next(err); }
};

export const postExpiredSweep = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await writeOffExpiredLots(req.body?.userId));
  } catch (err) { next(err); }
};

export const postQuarantine = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { locationId } = req.body;
    if (!locationId) {
      res.status(400).json({ message: "locationId is required" });
      return;
    }
    res.json(await quarantineLocation(locationId, req.body.quarantined !== false));
  } catch (err) { next(err); }
};
