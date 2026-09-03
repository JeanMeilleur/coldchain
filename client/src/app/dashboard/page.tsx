"use client";

import {
  AlertTriangle, DollarSign, Package, Percent, ShoppingCart, Trash2,
} from "lucide-react";
import { useAppSelector } from "@/app/redux";
import { useGetDashboardQuery } from "@/state/api";
import KpiTile from "./KpiTile";
import { RevenueTrend, WasteTrend } from "./TrendCharts";
import { WasteByReasonChart, WorstWasteProducts } from "./WastePanel";
import ExpiringLots from "./ExpiringLots";
import ColdChainPanel from "./ColdChainPanel";
import { money, pct, count, STATUS } from "./viz";

const Skeleton = () => (
  <div className="grid gap-5">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-32 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
    <div className="h-72 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
  </div>
);

const Dashboard = () => {
  const isDarkMode = useAppSelector((s) => s.global.isDarkMode);
  const { data, isLoading, isError } = useGetDashboardQuery();

  if (isLoading) return <Skeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-6">
        <h2 className="font-semibold text-red-800 dark:text-red-200">
          Could not load the dashboard
        </h2>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">
          The API did not respond. Check that the server is running on{" "}
          <code className="font-mono">{process.env.NEXT_PUBLIC_API_BASE_URL}</code>.
        </p>
      </div>
    );
  }

  const { kpis, meta, trend } = data;

  return (
    <div className="pb-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
          Operations overview
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Last {meta.periodDays} days · computed live at{" "}
          {new Date(meta.generatedAt).toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit",
          })}
        </p>
      </header>

      {/* Headline figures. Change % compares against the immediately preceding
          period of equal length. */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiTile
          label="Revenue" value={money(kpis.revenue.value)}
          changePct={kpis.revenue.changePct}
          sub={`vs prior ${meta.periodDays}d`}
          icon={DollarSign} accent="#2a78d6"
        />
        <KpiTile
          label="Goods received" value={money(kpis.goodsReceived.value)}
          changePct={kpis.goodsReceived.changePct}
          sub={`${pct(kpis.grossMargin.value)} margin`}
          icon={ShoppingCart} accent="#eb6834"
        />
        <KpiTile
          label="Waste cost" value={money(kpis.wasteCost.value)}
          changePct={kpis.wasteCost.changePct} lowerIsBetter
          sub={`${pct(kpis.wasteRatePct.value, 1)} of receipts`}
          icon={Trash2} accent={STATUS.critical}
        />
        <KpiTile
          label="At risk" value={money(kpis.atRisk.value)}
          sub={`${kpis.atRisk.lots} lots · ${pct(kpis.atRisk.pctOfInventory)} of stock`}
          icon={AlertTriangle} accent={STATUS.warning}
        />
        <KpiTile
          label="Inventory on hand" value={money(kpis.inventoryOnHand.value)}
          sub={`${count(kpis.inventoryOnHand.units)} units sellable`}
          icon={Package} accent="#1baf7a"
        />
        <KpiTile
          label="Waste rate" value={pct(kpis.wasteRatePct.value)}
          changePct={kpis.wasteRatePct.changePct} lowerIsBetter
          sub="of goods received" icon={Percent} accent={STATUS.serious}
        />
        <KpiTile
          label="Gross margin" value={pct(kpis.grossMargin.value)}
          sub="revenue less cost of goods" icon={Percent} accent="#4a3aa7"
        />
        <KpiTile
          label="Quarantined" value={money(kpis.quarantinedValue.value)}
          sub="held after excursion or recall"
          icon={AlertTriangle} accent="#898781"
        />
      </section>

      <section className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <RevenueTrend data={trend} dark={isDarkMode} />
        </div>
        <ColdChainPanel locations={data.coldChain} />
      </section>

      <section className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <WasteTrend data={trend} dark={isDarkMode} />
        </div>
        <WasteByReasonChart data={data.wasteByReason} />
      </section>

      <section className="mt-5">
        <ExpiringLots lots={data.expiringLots} days={meta.atRiskDays} />
      </section>

      <section className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <WorstWasteProducts data={data.worstWasteProducts} />

        <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
            Below reorder point
          </h3>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Sellable stock only -- expired and quarantined lots excluded
          </p>
          {data.reorderList.length === 0 ? (
            <p className="text-sm text-gray-500">Everything is above its reorder point.</p>
          ) : (
            <div className="space-y-2">
              {data.reorderList.map((r) => (
                <div
                  key={r.productId}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-100 dark:border-gray-700 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {r.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.supplierName ?? "No supplier"}
                      {r.leadTimeDays != null && ` · ${r.leadTimeDays}d lead time`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {r.onHand} / {r.reorderPoint}
                    </div>
                    <div className="text-xs text-gray-500">on hand / reorder at</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
