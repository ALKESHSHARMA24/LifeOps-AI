import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// This connection is used for queries (not migrations)
const queryClient = postgres(process.env.DATABASE_URL!);

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
