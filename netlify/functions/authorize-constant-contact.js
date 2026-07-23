import crypto from "crypto";

// Produces a signed, self-verifying state value: <nonce>.<timestamp>.<hmac>.
// The callback recomputes the HMAC and checks the timestamp, so no server-side
// storage of the state value is needed between the redirect and the callback.
function signState() {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${nonce}.${timestamp}`;
  const hmac = crypto
    .createHmac("sha256", process.env.CONSTANT_CONTACT_CLIENT_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${hmac}`;
}

export default async function handler() {
  const state = signState();

  const params = new URLSearchParams({
    client_id: process.env.CONSTANT_CONTACT_CLIENT_ID,

    redirect_uri:
      "https://livehorizonhouse.com/.netlify/functions/constant-contact-callback",

    response_type: "code",

    state,

    scope: "contact_data offline_access",
  });

  const authUrl =
    "https://authz.constantcontact.com/oauth2/default/v1/authorize?" +
    params.toString();

  return Response.redirect(authUrl, 302);
}