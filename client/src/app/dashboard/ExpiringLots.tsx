"use client";

import { AlertTriangle, PackageCheck } from "lucide-react";
import { ExpiringLot } from "@/state/api";
import { money, urgency } from "./viz";

/**
 * A table, not a chart.
 *
 * This is an action list: someone reads it and decides what to discount or
 * move today. Each row carries several attributes -- product, location, lot,
 * quantity, value, days remaining -- and no chart form conveys that better
 * than a table does.
 *
 * Urgency is shown as a colored dot AND a word. Color alone would exclude
 * colorblind readers from the most important column on the page.
 */
const ExpiringLots = ({ lots, days }: { lots: ExpiringLot[]; days: number }) => {
  const totalAtRisk = lots.reduce((s, l) => s + l.valueAtRisk, 0);

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-baseline justify-between gap-4 p-5 pb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
            Expiring within {days} days
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Soonest first -- this is the sell-or-lose list
          </p>
        </div>
        <span className="shrink-0 tabular-nums text-sm font-semibold text-gray-900 dark:text-gray-50">
          {money(totalAtRisk)} at risk
        </span>
      </div>

      {lots.length === 0 ? (
        <div className="flex items-center gap-2 px-5 pb-5 text-sm text-gray-500">
          <PackageCheck className="w-4 h-4" style={{ color: "#0ca30c" }} />
          Nothing expiring in this window.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-gray-200 dark:border-gray-700 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Lot</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Days</th>
                <th className="px-5 py-2 font-medium text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const u = urgency(lot.daysLeft);
                return (
                  <tr
                    key={lot.lotId}
                    className="border-b border-gray-100 dark:border-gray-700/60 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  >
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ background: u.color }}
                        />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                          {u.label}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-900 dark:text-gray-100">
                      {lot.productName}
                      <span className="ml-2 text-xs text-gray-400">{lot.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">
                      {lot.lotCode}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">
                      {lot.locationName ?? "--"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-200">
                      {lot.quantityRemaining}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                      {lot.daysLeft}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                      {money(lot.valueAtRisk)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpiringLots;
