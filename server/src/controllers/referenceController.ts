import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { dashboardQueries } from "../services/dashboardService";

export const getSuppliers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Supplier scorecard: who ships us stock that ends up in the bin?
    const rows = await prisma.$queryRaw<any[]>`
      SELECT s."supplierId", s.name, s."contactEmail", s."leadTimeDays",
             COUNT(DISTINCT p."productId")::int AS "productCount",
             COUNT(DISTINCT l."lotId")::int     AS "lotsSupplied",
             COALESCE(AVG(EXTRACT(DAY FROM (l."expiresAt" - l."receivedAt"))), 0)::float
               AS "avgShelfLifeOnArrival",
             COALESCE(SUM(-m.quantity * m."unitValue") FILTER (WHERE m.type='WASTE'), 0)::float
               AS "wasteCostAttributed"
      FROM "Supplier" s
      LEFT JOIN "Product" p ON p."supplierId" = s."supplierId"
      LEFT JOIN "Lot" l     ON l."supplierId" = s."supplierId"
      LEFT JOIN "StockMovement" m ON m."lotId" = l."lotId"
      WHERE s."isActive"
      GROUP BY s."supplierId"
      ORDER BY "wasteCostAttributed" DESC`;
    res.json(rows);
  } catch (err) { next(err); }
};

export const getLocations = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await dashboardQueries.getColdChainStatus(30));
  } catch (err) { next(err); }
};

export const getTemperatureReadings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 120);
    const readings = await prisma.temperatureReading.findMany({
      where: {
        locationId: req.query.locationId?.toString(),
        recordedAt: { gte: new Date(Date.now() - days * 86400000) },
      },
      orderBy: { recordedAt: "asc" },
      include: { location: { select: { name: true, targetTempC: true, toleranceC: true } } },
    });
    res.json(readings);
  } catch (err) { next(err); }
};

export const getCategories = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
  } catch (err) { next(err); }
};

export const getExpenses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    res.json(await dashboardQueries.getExpenseBreakdown(days));
  } catch (err) { next(err); }
};

/** Never returns passwordHash. */
export const getUsers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(
      await prisma.user.findMany({
        select: {
          userId: true, email: true, name: true,
          role: true, isActive: true, createdAt: true,
        },
        orderBy: { name: "asc" },
      })
    );
  } catch (err) { next(err); }
};
