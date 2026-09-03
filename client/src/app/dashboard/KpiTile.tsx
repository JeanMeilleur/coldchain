"use client";

import { LucideIcon, TrendingDown, TrendingUp, Minus } from "lucide-react";

type Props = {
  label: string;
  value: string;
  sub?: string;
  changePct?: number | null;
  /** Some metrics are good when they fall. Waste is the obvious one. */
  lowerIsBetter?: boolean;
  icon: LucideIcon;
  accent?: string;
};

/**
 * A single headline figure. No chart -- when the data's job is one number,
 * a number is the right form and a sparkline is decoration.
 */
const KpiTile = ({
  label, value, sub, changePct, lowerIsBetter = false, icon: Icon, accent,
}: Props) => {
  const hasChange = changePct !== null && changePct !== undefined;
  const rising = hasChange && changePct! > 0;
  const flat = hasChange && Math.abs(changePct!) < 0.05;
  const good = lowerIsBetter ? !rising : rising;

  const DeltaIcon = flat ? Minus : rising ? TrendingUp : TrendingDown;
  const deltaClass = flat
    ? "text-gray-500"
    : good
    ? "text-green-700 dark:text-green-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-5 flex flex-col justify-between min-h-[128px]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {label}
        </span>
        <Icon className="w-5 h-5 shrink-0" style={{ color: accent ?? "#898781" }} />
      </div>

      <div className="mt-3">
        <div className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">
          {value}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          {hasChange && (
            <span className={`inline-flex items-center gap-1 font-medium ${deltaClass}`}>
              <DeltaIcon className="w-3.5 h-3.5" />
              {Math.abs(changePct!).toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-gray-500 dark:text-gray-400">{sub}</span>}
        </div>
      </div>
    </div>
  );
};

export default KpiTile;
