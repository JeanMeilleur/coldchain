/**
 * One PrismaClient for the whole process.
 *
 * The tutorial constructed `new PrismaClient()` inside every controller.
 * Each instance opens its own connection pool, so a handful of controllers
 * quietly multiplies your Postgres connections and you hit the server's
 * connection limit under load for no reason. One client, imported everywhere.
 */
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export default prisma;
