// lib/constant-contact.ts
//
// Server-side Constant Contact client. Owns the OAuth refresh flow (including
// rotating refresh tokens) and the contact sign-up call. Imported only by
// Netlify Functions — never by browser code.
import {
  getStoredTokens,
  saveTokensIfRefreshTokenMatches,
} from "../db/tokens.js";

const TOKEN_URL =
  "https://authz.constantcontact.com/oauth2/default/v1/token";
const API_BASE = "https://api.cc.email/v3";

// Refresh the access token slightly before it actually expires to avoid racing
// the expiry boundary.
const EXPIRY_SKEW_MS = 60_000;

const WEBSITE_LEADS_LIST_NAME = "Website Leads";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// HTTP Basic auth header built from the app's client credentials, used for the
// OAuth token endpoint.
function basicAuthHeader(): string {
  const clientId = requireEnv("CONSTANT_CONTACT_CLIENT_ID");
  const clientSecret = requireEnv("CONSTANT_CONTACT_CLIENT_SECRET");
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

// Compute an absolute expiry Date from the `expires_in` seconds value returned
// by Constant Contact.
export function expiresAtFrom(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

// Persist a refreshed token response, guarded against concurrent refreshes.
// Constant Contact issues rotating refresh tokens: if the response contains a
// new refresh_token we must store it, otherwise we keep the previous one.
//
// The write is conditional on the row's refresh token still being the one we
// just used (`previousRefreshToken`). If a concurrent request already
// refreshed and rewrote the row first, this refresh "loses the race": the
// access token we obtained is still valid and gets returned to this caller,
// but it isn't persisted, so we don't clobber the newer rotation with a
// stale one.
async function persistTokenResponse(
  data: TokenResponse,
  previousRefreshToken: string,
): Promise<void> {
  const wrote = await saveTokensIfRefreshTokenMatches({
    expectedRefreshToken: previousRefreshToken,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previousRefreshToken,
    expiresAt: expiresAtFrom(data.expires_in),
  });

  if (!wrote) {
    console.warn(
      "Constant Contact token refresh lost a concurrent-refresh race; using this access token without persisting it.",
    );
  }
}

// Exchange the stored refresh token for a fresh access token and persist the
// result (rotating the refresh token when a new one is returned).
async function refreshTokens(refreshToken: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = (await response.json()) as TokenResponse;

  if (!response.ok) {
    // Do not log the token payload — it contains credentials.
    throw new Error(
      `Constant Contact token refresh failed (status ${response.status}).`,
    );
  }

  await persistTokenResponse(data, refreshToken);
  return data.access_token;
}

// Return a usable access token, refreshing first if the stored one is expired
// (or nearly so), or when `forceRefresh` is set.
async function getValidAccessToken(
  forceRefresh = false,
): Promise<string> {
  const tokens = await getStoredTokens();
  if (!tokens) {
    throw new Error(
      "Constant Contact is not authorized yet — no tokens are stored.",
    );
  }

  const stillValid =
    tokens.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();

  if (stillValid && !forceRefresh) {
    return tokens.accessToken;
  }

  return refreshTokens(tokens.refreshToken);
}

// Perform an authenticated Constant Contact API request. On a 401 (token
// rejected despite looking valid) it refreshes once and retries.
async function ccApiFetch(
  path: string,
  init: RequestInit = {},
  forceRefresh = false,
): Promise<Response> {
  const accessToken = await getValidAccessToken(forceRefresh);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (response.status === 401 && !forceRefresh) {
    return ccApiFetch(path, init, true);
  }

  return response;
}

// Resolve the Website Leads list id. Prefer an explicit env override; otherwise
// look it up by name via the API.
async function resolveWebsiteLeadsListId(): Promise<string> {
  const override = process.env.CONSTANT_CONTACT_WEBSITE_LEADS_LIST_ID;
  if (override) return override;

  const response = await ccApiFetch(
    "/contact_lists?include_count=false&limit=1000",
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load Constant Contact lists (status ${response.status}).`,
    );
  }

  const data = (await response.json()) as {
    lists?: { list_id: string; name: string }[];
  };

  const list = data.lists?.find(
    (l) => l.name.trim().toLowerCase() === WEBSITE_LEADS_LIST_NAME.toLowerCase(),
  );

  if (!list) {
    throw new Error(
      `Constant Contact list "${WEBSITE_LEADS_LIST_NAME}" was not found.`,
    );
  }

  return list.list_id;
}

export interface ContactInput {
  email: string;
  name?: string;
  phone?: string;
}

// Split a free-text full name into first / last parts for Constant Contact.
function splitName(name?: string): { firstName?: string; lastName?: string } {
  const trimmed = name?.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

// Add (or update) a visitor as a contact on the Website Leads list. Uses the
// sign-up-form endpoint, which is designed for website form opt-ins: it creates
// new contacts and merges into existing ones, and manages list membership.
export async function addContactToWebsiteLeads(
  contact: ContactInput,
): Promise<void> {
  const listId = await resolveWebsiteLeadsListId();
  const { firstName, lastName } = splitName(contact.name);

  const body: Record<string, unknown> = {
    email_address: contact.email,
    list_memberships: [listId],
  };

  if (firstName) body.first_name = firstName;
  if (lastName) body.last_name = lastName;
  if (contact.phone?.trim()) body.phone_number = contact.phone.trim();

  const response = await ccApiFetch("/contacts/sign_up_form", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to add contact to Constant Contact (status ${response.status}): ${detail}`,
    );
  }
}
