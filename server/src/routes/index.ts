import { Router } from "express";
import { getDashboardMetrics } from "../controllers/dashboardController";
import {
  getProducts, getProductById, createProduct,
} from "../controllers/productController";
import {
  getLots, getExpiring, getMovements,
  postSale, postReceipt, postWaste, postExpiredSweep, postQuarantine,
} from "../controllers/inventoryController";
import {
  getSuppliers, getLocations, getTemperatureReadings,
  getCategories, getExpenses, getUsers,
} from "../controllers/referenceController";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, at: new Date() }));

/** Root index -- so hitting the API in a browser tells you what exists. */
router.get("/", (_req, res) =>
  res.json({
    service: "ColdChain API",
    description: "Perishable / cold-chain inventory management",
    endpoints: {
      dashboard: "/dashboard?periodDays=30&trendDays=90&atRiskDays=7",
      products: "/products?search=&zone=FROZEN|REFRIGERATED|AMBIENT",
      productDetail: "/products/:id",
      lots: "/lots?productId=&limit=200",
      expiringLots: "/lots/expiring?days=7",
      movements: "/movements?type=SALE|RECEIPT|WASTE|ADJUSTMENT|TRANSFER",
      suppliers: "/suppliers",
      locations: "/locations",
      temperature: "/locations/temperature?days=7&locationId=",
      categories: "/categories",
      expenses: "/expenses?days=30",
      users: "/users",
    },
    writes: {
      recordSale: "POST /inventory/sale { productId, quantity }",
      receiveStock: "POST /inventory/receipt { productId, lotCode, quantity, unitCost }",
      recordWaste: "POST /inventory/waste { lotId, quantity, reason }",
      sweepExpired: "POST /inventory/sweep-expired",
      quarantine: "POST /inventory/quarantine { locationId, quarantined }",
    },
  })
);

// Reads
router.get("/dashboard", getDashboardMetrics);
router.get("/products", getProducts);
router.get("/products/:id", getProductById);
router.get("/lots", getLots);
router.get("/lots/expiring", getExpiring);
router.get("/movements", getMovements);
router.get("/suppliers", getSuppliers);
router.get("/locations", getLocations);
router.get("/locations/temperature", getTemperatureReadings);
router.get("/categories", getCategories);
router.get("/expenses", getExpenses);
router.get("/users", getUsers);

// Writes -- each one appends to the stock ledger
router.post("/products", createProduct);
router.post("/inventory/sale", postSale);
router.post("/inventory/receipt", postReceipt);
router.post("/inventory/waste", postWaste);
router.post("/inventory/sweep-expired", postExpiredSweep);
router.post("/inventory/quarantine", postQuarantine);

export default router;
