import { Request, Response, NextFunction } from "express";
import { getDashboard } from "../services/dashboardService";

const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback;
};

export const getDashboardMetrics = async (
  req: Request, res: Response, next: NextFunction
) => {
  try {
    res.json(
      await getDashboard({
        periodDays: int(req.query.periodDays, 30, 1, 365),
        trendDays: int(req.query.trendDays, 90, 7, 365),
        atRiskDays: int(req.query.atRiskDays, 7, 1, 90),
      })
    );
  } catch (err) {
    next(err);
  }
};
