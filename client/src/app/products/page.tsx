"use client";

import { useState } from "react";
import { PlusCircleIcon, SearchIcon } from "lucide-react";
import {
  NewProduct, StorageZone, useCreateProductMutation, useGetProductsQuery,
} from "@/state/api";
import Header from "@/app/(components)/Header";
import CreateProductModal from "./CreateProductModal";
import { money, urgency } from "@/app/dashboard/viz";

const ZONES: { label: string; value?: StorageZone }[] = [
  { label: "All zones" },
  { label: "Frozen", value: "FROZEN" },
  { label: "Refrigerated", value: "REFRIGERATED" },
  { label: "Ambient", value: "AMBIENT" },
];

const ZONE_STYLE: Record<StorageZone, string> = {
  FROZEN: "bg-blue-100 text-blue-800",
  REFRIGERATED: "bg-cyan-100 text-cyan-800",
  AMBIENT: "bg-amber-100 text-amber-800",
};

const Products = () => {
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState<StorageZone | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: products, isLoading, isError } = useGetProductsQuery({
    search: search || undefined,
    zone,
  });
  const [createProduct] = useCreateProductMutation();

  if (isError) {
    return <div className="text-center text-red-500 py-4">Failed to fetch products</div>;
  }

  return (
    <div className="mx-auto pb-5 w-full">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <Header name="Product catalog" />
          <button
            className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            onClick={() => setIsModalOpen(true)}
          >
            <PlusCircleIcon className="w-5 h-5" /> Add product
          </button>
        </div>

        {/* Filters sit in one row above the content. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded border-2 border-gray-200 bg-white px-2">
            <SearchIcon className="w-5 h-5 text-gray-500" />
            <input
              className="w-64 rounded bg-white px-3 py-2 outline-none"
              placeholder="Search name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5">
            {ZONES.map((z) => (
              <button
                key={z.label}
                onClick={() => setZone(z.value)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  zone === z.value
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-4">Loading...</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products?.map((p) => {
            const days = p.nextExpiry
              ? Math.ceil((new Date(p.nextExpiry).getTime() - Date.now()) / 86400000)
              : null;
            const u = days === null ? null : urgency(days);
            const low = p.onHand <= p.reorderPoint;

            return (
              <div
                key={p.productId}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-gray-900">{p.name}</h3>
                    <p className="font-mono text-xs text-gray-400">{p.sku}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      ZONE_STYLE[p.storageZone]
                    }`}
                  >
                    {p.storageZone.toLowerCase()}
                  </span>
                </div>

                <p className="mt-3 text-lg font-semibold text-gray-900">
                  {money(p.unitPrice)}
                  <span className="ml-1 text-sm font-normal text-gray-500">/{p.unit}</span>
                </p>

                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">On hand</dt>
                    <dd
                      className={`tabular-nums font-medium ${
                        low ? "text-red-600" : "text-gray-900"
                      }`}
                    >
                      {p.onHand} {low && "· reorder"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Open lots</dt>
                    <dd className="tabular-nums text-gray-900">{p.openLots}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Shelf life</dt>
                    <dd className="tabular-nums text-gray-900">{p.shelfLifeDays} days</dd>
                  </div>
                  {u && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Next expiry</dt>
                      <dd className="flex items-center gap-1.5 font-medium text-gray-900">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: u.color }}
                        />
                        {days}d · {u.label}
                      </dd>
                    </div>
                  )}
                </dl>

                <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                  {p.supplierName ?? "No supplier"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <CreateProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={async (data: NewProduct) => {
          await createProduct(data);
          setIsModalOpen(false);
        }}
      />
    </div>
  );
};

export default Products;
