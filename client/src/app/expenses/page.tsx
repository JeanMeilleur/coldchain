"use client";

import { useState } from "react";
import { useGetExpensesQuery } from "@/state/api";
import Header from "@/app/(components)/Header";
import { money } from "@/app/dashboard/viz";

const RANGES = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

/**
 * Horizontal bars rather than a pie: comparing lengths along a shared baseline
 * is easier than comparing angles, and every value is directly labeled.
 */
const Expenses = () => {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useGetExpensesQuery(days);

  const total = data?.reduce((s, d) => s + d.amount, 0) ?? 0;
  const max = Math.max(...(data?.map((d) => d.amount) ?? [1]), 1);

  return (
    <div>
      <Header name="Operating expenses" />

      <div className="mt-4 mb-5 flex items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
              days === r.days
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-500">Loading...</p>}
      {isError && <p className="text-red-500">Failed to load expenses.</p>}

      {data && (
        <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-sm text-gray-500">
              Total over the last {days} days
            </span>
            <span className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
              {money(total)}
            </span>
          </div>
          <div className="space-y-3">
            {data.map((e) => (
              <div key={e.category}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">{e.category}</span>
                  <span className="tabular-nums font-medium text-gray-900 dark:text-gray-50">
                    {money(e.amount)}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {((e.amount / (total || 1)) * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.max((e.amount / max) * 100, 1.5)}%`,
                      background: "#2a78d6",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
