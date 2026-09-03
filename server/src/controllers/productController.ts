import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { getOnHand } from "../services/inventoryService";
import { serialize } from "../lib/serialize";

/**
 * Product list with derived stock figures.
 *
 * There is no stockQuantity column to read -- on-hand is aggregated from
 * lots, and expired or quarantined stock is deliberately excluded so the
 * number means "what could we actually ship today".
 */
export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search?.toString().trim();
    const zone = req.query.zone?.toString();

    const rows = await prisma.$queryRaw<any[]>`
      SELECT p."productId", p.sku, p.name, p.unit, p."unitPrice"::float AS "unitPrice",
             p."storageZone"::text AS "storageZone",
             p."shelfLifeDays", p."reorderPoint", p."isActive",
             c.name AS "categoryName",
             s.name AS "supplierName",
             COALESCE(SUM(l."quantityRemaining") FILTER (
               WHERE NOT l."isQuarantined" AND l."expiresAt" > NOW()), 0)::int AS "onHand",
             COALESCE(SUM(l."quantityRemaining" * l."unitCost") FILTER (
               WHERE NOT l."isQuarantined" AND l."expiresAt" > NOW()), 0)::float AS "onHandValue",
             COUNT(l."lotId") FILTER (
               WHERE l."quantityRemaining" > 0 AND l."expiresAt" > NOW())::int AS "openLots",
             MIN(l."expiresAt") FILTER (
               WHERE l."quantityRemaining" > 0 AND l."expiresAt" > NOW()) AS "nextExpiry"
      FROM "Product" p
      LEFT JOIN "Lot" l       ON l."productId" = p."productId" AND l."quantityRemaining" > 0
      LEFT JOIN "Category" c  ON c."categoryId" = p."categoryId"
      LEFT JOIN "Supplier" s  ON s."supplierId" = p."supplierId"
      WHERE (${search}::text IS NULL OR p.name ILIKE '%' || ${search} || '%' OR p.sku ILIKE '%' || ${search} || '%')
        AND (${zone}::text IS NULL OR p."storageZone"::text = ${zone})
      GROUP BY p."productId", c.name, s.name
      ORDER BY p.name`;

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await prisma.product.findUnique({
      where: { productId: req.params.id },
      include: {
        category: true,
        supplier: true,
        lots: {
          where: { quantityRemaining: { gt: 0 } },
          orderBy: { expiresAt: "asc" },
          include: { location: true },
        },
      },
    });
    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    res.json(serialize({ ...product, onHand: await getOnHand(product.productId) }));
  } catch (err) {
    next(err);
  }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sku, name, unitPrice, storageZone, shelfLifeDays } = req.body;
    if (!sku || !name || unitPrice == null || !storageZone || shelfLifeDays == null) {
      res.status(400).json({
        message: "sku, name, unitPrice, storageZone and shelfLifeDays are required",
      });
      return;
    }
    const product = await prisma.product.create({
      data: {
        sku, name,
        description: req.body.description,
        unit: req.body.unit ?? "case",
        unitPrice: Number(unitPrice),
        storageZone,
        shelfLifeDays: Number(shelfLifeDays),
        reorderPoint: Number(req.body.reorderPoint ?? 0),
        categoryId: req.body.categoryId,
        supplierId: req.body.supplierId,
      },
    });
    res.status(201).json(serialize(product));
  } catch (err) {
    next(err);
  }
};
