"use client";

import { Snowflake, Thermometer, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ColdChainLocation } from "@/state/api";
import { tempStatus } from "./viz";

/**
 * Cold-chain compliance. Status is icon + word + color, never color alone.
 */
const ColdChainPanel = ({ locations }: { locations: ColdChainLocation[] }) => (
  <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-5">
    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
      Cold chain
    </h3>
    <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
      Latest reading per location, and excursions this period
    </p>

    <div className="space-y-2.5">
      {locations.map((loc) => {
        const s = tempStatus(loc.latestTempC, loc.targetTempC, loc.toleranceC);
        const monitored = loc.targetTempC !== null;
        const Icon = !monitored ? Thermometer : s.ok ? CheckCircle2 : AlertTriangle;
        return (
          <div
            key={loc.locationId}
            className="flex items-center justify-between gap-3 rounded-md border border-gray-100 dark:border-gray-700 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {loc.zone === "FROZEN" && (
                  <Snowflake className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                )}
                <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {loc.name}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {monitored
                  ? `Target ${loc.targetTempC}°C ±${loc.toleranceC}°`
                  : "Ambient -- not monitored"}
                {" · "}
                {loc.lotsStored} lots
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {loc.excursions > 0 && (
                <span className="rounded-full bg-red-50 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                  {loc.excursions} excursion{loc.excursions === 1 ? "" : "s"}
                </span>
              )}
              <div className="text-right">
                <div className="tabular-nums text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {loc.latestTempC === null ? "--" : `${loc.latestTempC.toFixed(1)}°C`}
                </div>
                <div
                  className="flex items-center justify-end gap-1 text-xs font-medium"
                  style={{ color: s.color }}
                >
                  <Icon className="w-3 h-3" />
                  {s.label}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default ColdChainPanel;
