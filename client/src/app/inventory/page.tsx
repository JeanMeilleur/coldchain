"use client";

import { useGetLotsQuery } from "@/state/api";
import Header from "@/app/(components)/Header";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { money, urgency } from "@/app/dashboard/viz";

/**
 * Inventory is a list of LOTS, not products.
 *
 * The tutorial listed products with a single stockQuantity number. For
 * perishables that view is misleading -- "40 cases of salmon" hides that half
 * of them expire tomorrow. Every row here is one batch with its own date.
 */
const daysUntil = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

const columns: GridColDef[] = [
  {
    field: "expiresAt", headerName: "Expires", width: 150,
    renderCell: (params) => {
      const days = daysUntil(params.value as string);
      const u = urgency(days);
      return (
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: u.color }}
          />
          <span>
            {new Date(params.value as string).toLocaleDateString("en-US", {
              month: "short", day: "numeric",
            })}
            <span className="ml-1.5 text-xs text-gray-500">{days}d</span>
          </span>
        </span>
      );
    },
  },
  {
    field: "product", headerName: "Product", width: 240,
    valueGetter: (_v, row) => row.product?.name ?? "",
  },
  {
    field: "sku", headerName: "SKU", width: 110,
    valueGetter: (_v, row) => row.product?.sku ?? "",
  },
  { field: "lotCode", headerName: "Lot", width: 140 },
  {
    field: "location", headerName: "Location", width: 190,
    valueGetter: (_v, row) => row.location?.name ?? "--",
  },
  {
    field: "quantityRemaining", headerName: "On hand", width: 100, type: "number",
  },
  {
    field: "quantityReceived", headerName: "Received", width: 100, type: "number",
  },
  {
    field: "unitCost", headerName: "Unit cost", width: 110, type: "number",
    valueFormatter: (v) => money(Number(v)),
  },
  {
    field: "value", headerName: "Value", width: 120, type: "number",
    valueGetter: (_v, row) => row.quantityRemaining * row.unitCost,
    valueFormatter: (v) => money(Number(v)),
  },
  {
    field: "isQuarantined", headerName: "Status", width: 120,
    renderCell: (params) =>
      params.value ? (
        <span className="text-xs font-medium text-red-600">Quarantined</span>
      ) : (
        <span className="text-xs text-gray-500">Available</span>
      ),
  },
];

const Inventory = () => {
  const { data: lots, isError, isLoading } = useGetLotsQuery();

  if (isLoading) return <div className="py-4">Loading inventory...</div>;
  if (isError || !lots)
    return <div className="text-center text-red-500 py-4">Failed to load lots</div>;

  return (
    <div className="flex flex-col">
      <Header name="Inventory by lot" />
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Every batch in stock with its own expiration date, sorted soonest first.
      </p>
      <DataGrid
        rows={lots}
        columns={columns}
        getRowId={(row) => row.lotId}
        density="compact"
        checkboxSelection
        className="bg-white shadow rounded-lg border border-gray-200 !text-gray-700"
      />
    </div>
  );
};

export default Inventory;
