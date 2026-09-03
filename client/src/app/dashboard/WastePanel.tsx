"use client";

import { WasteByReason, WasteProduct } from "@/state/api";
import { money, count } from "./viz";

const REASON_LABEL: Record<string, string> = {
  EXPIRED: "Expired on shelf",
  DAMAGED: "Damaged",
  TEMPERATURE_EXCURSION: "Temperature excursion",
  RECALL: "Recall",
  OTHER: "Other",
  UNSPECIFIED: "Unspecified",
};

/**
 * Horizontal bars, not a pie.
 *
 * The job is comparing magnitudes, and length along a common baseline is far
 * easier to compare than angle. Every bar is directly labeled with its value,
 * so the chart never depends on reading a scale.
 */
export const WasteByReasonChart = ({ data }: { data: WasteByReason[] }) => {
  const total = data.reduce((s, d) => s + d.cost, 0) || 1;
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
        Why stock is written off
      </h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Share of waste cost by cause
      </p>
      <div className="space-y-3">
        {data.length === 0 && (
          <p className="text-sm text-gray-500">No waste recorded in this period.</p>
        )}
        {data.map((d) => {
          const share = (d.cost / total) * 100;
          return (
            <div key={d.reason}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-700 dark:text-gray-200">
                  {REASON_LABEL[d.reason] ?? d.reason}
                </span>
                <span className="tabular-nums font-medium text-gray-900 dark:text-gray-50">
                  {money(d.cost)}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {share.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{ width: `${Math.max(share, 1.5)}%`, background: "#d03b3b" }}
                />
              </div>
              <div className="mt-0.5 text-xs text-gray-500">{count(d.units)} units</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Worst products by waste cost, with shelf life shown alongside.
 *
 * Shelf life is the explanatory variable -- the list is almost always sorted by
 * it implicitly, and showing it turns "these products waste money" into "short
 * shelf life is why".
 */
export const WorstWasteProducts = ({ data }: { data: WasteProduct[] }) => {
  const max = Math.max(...data.map((d) => d.cost), 1);
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
        Where the money goes
      </h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Waste cost by product, with shelf life
      </p>
      <div className="space-y-3">
        {data.map((d) => (
          <div key={d.productId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-gray-700 dark:text-gray-200" title={d.name}>
                {d.name}
              </span>
              <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-gray-50">
                {money(d.cost)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max((d.cost / max) * 100, 1.5)}%`,
                    background: "#eb6834",
                  }}
                />
              </div>
              <span className="shrink-0 text-xs text-gray-500 tabular-nums">
                {d.shelfLifeDays}d shelf
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
