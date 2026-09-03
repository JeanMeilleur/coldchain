/**
 * API client (RTK Query).
 *
 * Types here mirror the server's response shapes exactly. The tutorial's
 * DashboardMetrics -- salesSummary / purchaseSummary / expenseSummary --
 * described pre-computed summary tables that no longer exist. Every field
 * below is aggregated live from the stock ledger on each request.
 */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export type StorageZone = "FROZEN" | "REFRIGERATED" | "AMBIENT";
export type MovementType = "RECEIPT" | "SALE" | "WASTE" | "ADJUSTMENT" | "TRANSFER";
export type WasteReason =
  | "EXPIRED" | "DAMAGED" | "TEMPERATURE_EXCURSION" | "RECALL" | "OTHER";

/** A headline figure plus its change against the preceding period.
 *  changePct is null when the previous period was zero -- there is no
 *  meaningful percentage change from nothing, and rendering "∞%" or "100%"
 *  would be a lie. */
export interface Kpi {
  value: number;
  changePct?: number | null;
}

export interface TrendPoint {
  day: string;
  revenue: number;
  waste: number;
  received: number;
}

export interface WasteByReason {
  reason: WasteReason | "UNSPECIFIED";
  units: number;
  cost: number;
}

export interface WasteProduct {
  productId: string;
  sku: string;
  name: string;
  shelfLifeDays: number;
  units: number;
  cost: number;
}

export interface ExpiringLot {
  lotId: string;
  lotCode: string;
  productName: string;
  sku: string;
  locationName: string | null;
  quantityRemaining: number;
  expiresAt: string;
  daysLeft: number;
  valueAtRisk: number;
}

export interface ReorderItem {
  productId: string;
  sku: string;
  name: string;
  onHand: number;
  reorderPoint: number;
  supplierName: string | null;
  leadTimeDays: number | null;
}

export interface ColdChainLocation {
  locationId: string;
  name: string;
  zone: StorageZone;
  targetTempC: number | null;
  toleranceC: number;
  latestTempC: number | null;
  latestReadingAt: string | null;
  excursions: number;
  lotsStored: number;
}

export interface TopProduct {
  productId: string;
  sku: string;
  name: string;
  units: number;
  revenue: number;
}

export interface ExpenseSlice {
  category: string;
  amount: number;
}

export interface DashboardResponse {
  meta: {
    periodDays: number;
    trendDays: number;
    atRiskDays: number;
    generatedAt: string;
  };
  kpis: {
    revenue: Kpi;
    goodsReceived: Kpi;
    wasteCost: Kpi;
    wasteRatePct: Kpi;
    grossMargin: Kpi;
    inventoryOnHand: Kpi & { units: number };
    atRisk: Kpi & { lots: number; pctOfInventory: number };
    quarantinedValue: Kpi;
  };
  trend: TrendPoint[];
  wasteByReason: WasteByReason[];
  worstWasteProducts: WasteProduct[];
  expiringLots: ExpiringLot[];
  reorderList: ReorderItem[];
  coldChain: ColdChainLocation[];
  topProducts: TopProduct[];
  expenseBreakdown: ExpenseSlice[];
}

export interface Product {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  unitPrice: number;
  storageZone: StorageZone;
  shelfLifeDays: number;
  reorderPoint: number;
  isActive: boolean;
  categoryName: string | null;
  supplierName: string | null;
  onHand: number;
  onHandValue: number;
  openLots: number;
  nextExpiry: string | null;
}

export interface NewProduct {
  sku: string;
  name: string;
  unitPrice: number;
  storageZone: StorageZone;
  shelfLifeDays: number;
  reorderPoint?: number;
  unit?: string;
}

export interface Lot {
  lotId: string;
  lotCode: string;
  productId: string;
  receivedAt: string;
  expiresAt: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number;
  isQuarantined: boolean;
  product: { sku: string; name: string; storageZone: StorageZone };
  location: { name: string; zone: StorageZone } | null;
  supplier: { name: string } | null;
}

export interface Movement {
  movementId: string;
  type: MovementType;
  quantity: number;
  unitValue: number;
  wasteReason: WasteReason | null;
  note: string | null;
  occurredAt: string;
  lot: { lotCode: string; product: { sku: string; name: string } };
  user: { name: string } | null;
}

export interface Supplier {
  supplierId: string;
  name: string;
  contactEmail: string | null;
  leadTimeDays: number;
  productCount: number;
  lotsSupplied: number;
  avgShelfLifeOnArrival: number;
  wasteCostAttributed: number;
}

export interface TemperatureReading {
  readingId: string;
  locationId: string;
  tempC: number;
  isExcursion: boolean;
  recordedAt: string;
  location: { name: string; targetTempC: number | null; toleranceC: number };
}

export interface User {
  userId: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "STAFF";
  isActive: boolean;
  createdAt: string;
}

export interface SaleResult {
  productId: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
  lotsUsed: number;
  allocations: {
    lotId: string;
    lotCode: string;
    quantity: number;
    expiresAt: string;
    unitCost: number;
  }[];
}

export const api = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL }),
  reducerPath: "api",
  tagTypes: ["Dashboard", "Products", "Lots", "Movements", "Suppliers", "ColdChain", "Users", "Expenses"],
  endpoints: (build) => ({
    getDashboard: build.query<
      DashboardResponse,
      { periodDays?: number; trendDays?: number; atRiskDays?: number } | void
    >({
      query: (params) => ({ url: "/dashboard", params: params ?? {} }),
      providesTags: ["Dashboard"],
    }),

    getProducts: build.query<Product[], { search?: string; zone?: StorageZone } | void>({
      query: (params) => ({ url: "/products", params: params ?? {} }),
      providesTags: ["Products"],
    }),

    createProduct: build.mutation<Product, NewProduct>({
      query: (body) => ({ url: "/products", method: "POST", body }),
      invalidatesTags: ["Products", "Dashboard"],
    }),

    getLots: build.query<Lot[], { productId?: string; limit?: number } | void>({
      query: (params) => ({ url: "/lots", params: params ?? {} }),
      providesTags: ["Lots"],
    }),

    getExpiringLots: build.query<ExpiringLot[], number | void>({
      query: (days) => ({ url: "/lots/expiring", params: { days: days ?? 7 } }),
      providesTags: ["Lots"],
    }),

    getMovements: build.query<Movement[], { type?: MovementType; limit?: number } | void>({
      query: (params) => ({ url: "/movements", params: params ?? {} }),
      providesTags: ["Movements"],
    }),

    getSuppliers: build.query<Supplier[], void>({
      query: () => "/suppliers",
      providesTags: ["Suppliers"],
    }),

    getColdChain: build.query<ColdChainLocation[], void>({
      query: () => "/locations",
      providesTags: ["ColdChain"],
    }),

    getTemperatureReadings: build.query<
      TemperatureReading[],
      { days?: number; locationId?: string } | void
    >({
      query: (params) => ({ url: "/locations/temperature", params: params ?? {} }),
      providesTags: ["ColdChain"],
    }),

    getExpenses: build.query<ExpenseSlice[], number | void>({
      query: (days) => ({ url: "/expenses", params: { days: days ?? 30 } }),
      providesTags: ["Expenses"],
    }),

    getUsers: build.query<User[], void>({
      query: () => "/users",
      providesTags: ["Users"],
    }),

    // --- writes: each one invalidates everything the ledger feeds ---------
    recordSale: build.mutation<SaleResult, { productId: string; quantity: number }>({
      query: (body) => ({ url: "/inventory/sale", method: "POST", body }),
      invalidatesTags: ["Dashboard", "Lots", "Movements", "Products"],
    }),

    recordWaste: build.mutation<
      unknown,
      { lotId: string; quantity: number; reason: WasteReason; note?: string }
    >({
      query: (body) => ({ url: "/inventory/waste", method: "POST", body }),
      invalidatesTags: ["Dashboard", "Lots", "Movements", "Products"],
    }),

    receiveStock: build.mutation<
      Lot,
      {
        productId: string; lotCode: string; quantity: number;
        unitCost: number; expiresAt?: string; locationId?: string;
      }
    >({
      query: (body) => ({ url: "/inventory/receipt", method: "POST", body }),
      invalidatesTags: ["Dashboard", "Lots", "Movements", "Products"],
    }),

    sweepExpired: build.mutation<
      { lotsWrittenOff: number; unitsWrittenOff: number }, void
    >({
      query: () => ({ url: "/inventory/sweep-expired", method: "POST" }),
      invalidatesTags: ["Dashboard", "Lots", "Movements", "Products"],
    }),
  }),
});

export const {
  useGetDashboardQuery,
  useGetProductsQuery,
  useCreateProductMutation,
  useGetLotsQuery,
  useGetExpiringLotsQuery,
  useGetMovementsQuery,
  useGetSuppliersQuery,
  useGetColdChainQuery,
  useGetTemperatureReadingsQuery,
  useGetExpensesQuery,
  useGetUsersQuery,
  useRecordSaleMutation,
  useRecordWasteMutation,
  useReceiveStockMutation,
  useSweepExpiredMutation,
} = api;
