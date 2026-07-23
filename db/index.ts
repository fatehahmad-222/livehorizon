// db/index.ts
import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema.js";

// The connection is configured automatically from the Netlify Database
// environment — no connection string is passed here. This client is only ever
// imported by server-side Netlify Functions, never by browser code.
export const db = drizzle({ schema });
