"use client";

import React, { ChangeEvent, FormEvent, useState } from "react";
import { NewProduct, StorageZone } from "@/state/api";
import Header from "@/app/(components)/Header";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (product: NewProduct) => void;
};

const EMPTY: NewProduct = {
  sku: "",
  name: "",
  unitPrice: 0,
  storageZone: "REFRIGERATED",
  shelfLifeDays: 7,
  reorderPoint: 0,
  unit: "case",
};

const CreateProductModal = ({ isOpen, onClose, onCreate }: Props) => {
  const [form, setForm] = useState<NewProduct>(EMPTY);

  if (!isOpen) return null;

  const set = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const numeric = ["unitPrice", "shelfLifeDays", "reorderPoint"];
    setForm({ ...form, [name]: numeric.includes(name) ? Number(value) : value });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCreate(form);
    setForm(EMPTY);
  };

  const label = "block text-sm font-medium text-gray-700 mt-4";
  const input =
    "block w-full mt-1 rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-20 flex h-full w-full items-center justify-center overflow-y-auto bg-gray-600 bg-opacity-50">
      <div className="w-full max-w-md rounded-md bg-white p-6 shadow-lg">
        <Header name="Add a product" />
        <form onSubmit={submit}>
          <label htmlFor="sku" className={label}>SKU</label>
          <input name="sku" placeholder="REF-2013" value={form.sku}
            onChange={set} className={input} required />

          <label htmlFor="name" className={label}>Name</label>
          <input name="name" placeholder="Whole Milk, 1 gal" value={form.name}
            onChange={set} className={input} required />

          <label htmlFor="unitPrice" className={label}>Unit price</label>
          <input type="number" step="0.01" min="0" name="unitPrice"
            value={form.unitPrice} onChange={set} className={input} required />

          <label htmlFor="storageZone" className={label}>Storage zone</label>
          <select name="storageZone" value={form.storageZone} onChange={set}
            className={input} required>
            <option value="FROZEN">Frozen (-18°C)</option>
            <option value="REFRIGERATED">Refrigerated (0-4°C)</option>
            <option value="AMBIENT">Ambient</option>
          </select>

          <label htmlFor="shelfLifeDays" className={label}>
            Shelf life (days from receipt)
          </label>
          <input type="number" min="1" name="shelfLifeDays"
            value={form.shelfLifeDays} onChange={set} className={input} required />

          <label htmlFor="reorderPoint" className={label}>Reorder point</label>
          <input type="number" min="0" name="reorderPoint"
            value={form.reorderPoint} onChange={set} className={input} />

          <div className="mt-6 flex gap-2">
            <button type="submit"
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
              Create
            </button>
            <button type="button" onClick={onClose}
              className="rounded bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProductModal;
