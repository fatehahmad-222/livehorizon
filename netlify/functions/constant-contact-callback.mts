import crypto from "crypto";
import type { Context } from "@netlify/functions";
import { saveTokens } from "../../db/tokens.js";

const REDIRECT_URI =
  "https://livehorizonhouse.com/.netlify/functions/constant-contact-callback";
const TOKEN_URL =
  "https://authz.constantcontact.com/oauth2/default/v1/token";

// Must match the max age used when signing state in authorize-constant-contact.js.
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// Verifies the HMAC-signed `state` value produced by authorize-constant-contact.js.
// Stateless by design (no DB round trip needed) — the signature and embedded
// timestamp are enough to prove the request originated from our own authorize
// step and hasn't expired.
function isValidState(state: string | null, secret: string): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, timestamp, signature] = parts;
  if (!nonce || !timestamp || !signature) return false;

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > STATE_MAX_AGE_MS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${nonce}.${timestamp}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export default async function handler(request: Request, _context: Context) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`Authorization failed: ${error}`, { status: 400 });
  }

  if (!code) {
    return new Response("No authorization code received.", { status: 400 });
  }

  // Standard Netlify Functions (this file, under netlify/functions) read
  // environment variables via process.env — Netlify.env.get() is the Edge
  // Functions (Deno) API and is not defined in this runtime.
  const clientId = process.env.CONSTANT_CONTACT_CLIENT_ID;
  const clientSecret = process.env.CONSTANT_CONTACT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Constant Contact client credentials are not configured.");
    return new Response("Server configuration error.", { status: 500 });
  }

  if (!isValidState(state, clientSecret)) {
    console.error("Constant Contact OAuth callback received an invalid or expired state.");
    return new Response("Invalid or expired authorization request.", { status: 400 });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenResponse.json()) as TokenResponse;

  if (!tokenResponse.ok) {
    // Never log the token payload itself — it contains credentials.
    console.error("Token exchange failed with status:", tokenResponse.status);
    return new Response("Token exchange failed.", { status: 500 });
  }

  // Persist the initial token set. The refresh token here is the first in the
  // rotating series; the refresh flow updates it going forward.
  await saveTokens({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
  });

  console.log("Constant Contact token exchange successful; tokens stored.");

  return new Response(
    "Constant Contact authorization successful. Tokens stored. You can close this page.",
    { status: 200 },
  );
}
