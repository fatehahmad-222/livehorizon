// db/tokens.ts
//
// Server-side data-access helpers for the single Constant Contact token row.
// This module is imported only by Netlify Functions; tokens never leave the
// server.
import { and, eq } from "drizzle-orm";
import { db } from "./index.js";
import { constantContactTokens } from "./schema.js";

// There is exactly one Constant Contact account, stored as a singleton row.
const SINGLETON_ID = 1;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  updatedAt: Date;
}

export interface TokenInput {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// Returns the stored token set, or null if the account has never been
// authorized yet.
export async function getStoredTokens(): Promise<StoredTokens | null> {
  const [row] = await db
    .select()
    .from(constantContactTokens)
    .where(eq(constantContactTokens.id, SINGLETON_ID));

  if (!row) return null;

  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}

// Inserts or updates the singleton token row. Used both for the initial save
// after OAuth authorization and for every subsequent refresh. `updatedAt` is
// always stamped to the current time.
export async function saveTokens({
  accessToken,
  refreshToken,
  expiresAt,
}: TokenInput): Promise<void> {
  const updatedAt = new Date();

  await db
    .insert(constantContactTokens)
    .values({
      id: SINGLETON_ID,
      accessToken,
      refreshToken,
      expiresAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: constantContactTokens.id,
      set: { accessToken, refreshToken, expiresAt, updatedAt },
    });
}

// Persists the result of a token *refresh*, guarded so two concurrent
// refreshes (e.g. two form submissions racing on an expired token) can't
// stomp on each other. The write only takes effect if the row's refresh
// token still matches the one this refresh call was made with — if another
// request already refreshed and rewrote the row first, this returns false
// and the caller can fall back to whatever is now stored instead of
// overwriting a newer, valid rotation with a stale one.
export async function saveTokensIfRefreshTokenMatches({
  expectedRefreshToken,
  accessToken,
  refreshToken,
  expiresAt,
}: TokenInput & { expectedRefreshToken: string }): Promise<boolean> {
  const updatedAt = new Date();

  const updated = await db
    .update(constantContactTokens)
    .set({ accessToken, refreshToken, expiresAt, updatedAt })
    .where(
      and(
        eq(constantContactTokens.id, SINGLETON_ID),
        eq(constantContactTokens.refreshToken, expectedRefreshToken),
      ),
    )
    .returning({ id: constantContactTokens.id });

  return updated.length > 0;
}
