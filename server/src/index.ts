import express, { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes";
import prisma from "./lib/prisma";

dotenv.config();

const app = express();

app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
/**
 * CORS.
 *
 * In development anything on localhost is fine. In production the API should
 * only answer the deployed frontend -- CLIENT_ORIGIN is set to the Vercel URL.
 * `cors()` with no arguments allows every origin, which is careless once the
 * API is on the public internet.
 */
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" && allowedOrigins.length > 0
        ? allowedOrigins
        : true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));

app.use("/", routes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Not found" });
});

/**
 * One error handler for the whole API.
 *
 * Controllers call next(err) instead of each writing its own try/catch
 * response, so error shape stays consistent and a stack trace never leaks
 * to the client in production.
 */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const isDev = process.env.NODE_ENV !== "production";
  res.status(err.status ?? 500).json({
    message: err.message ?? "Internal server error",
    ...(isDev && err.stack ? { stack: err.stack } : {}),
  });
});

const port = Number(process.env.PORT) || 8000;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`ColdChain API listening on http://localhost:${port}`);
});

// Close the DB pool cleanly instead of letting connections dangle on restart.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`\n${signal} received, shutting down...`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

export default app;
