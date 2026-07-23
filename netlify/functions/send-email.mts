import type { Context } from "@netlify/functions";
import { addContactToWebsiteLeads } from "../../lib/constant-contact.js";
import { recordContactFormSubmission } from "../../db/submissions.js";
import { sendNotificationEmail } from "../../lib/send-notification.js";

interface ContactFormData {
  name?: string;
  email?: string;
  phone?: string;
  person?: string;
  message?: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(request: Request, _context: Context) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let data: ContactFormData;
  try {
    data = (await request.json()) as ContactFormData;
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const email = data.email?.trim();
  if (!email) {
    return jsonResponse({ error: "Email address is required" }, 400);
  }

  let syncedToConstantContact = true;
  let ccError: unknown = null;

  try {
    await addContactToWebsiteLeads({
      email,
      name: data.name,
      phone: data.phone,
    });
  } catch (err) {
    syncedToConstantContact = false;
    ccError = err;
    console.error(
      "Failed to add contact to Constant Contact:",
      err instanceof Error ? err.message : err,
    );
  }

  // Record the full submission — including `person` and `message`, which
  // Constant Contact's sign-up-form contact record has no field for — so the
  // site owner has a durable record of the inquiry regardless of whether the
  // Constant Contact sync succeeded.
  try {
    await recordContactFormSubmission({
      name: data.name,
      email,
      phone: data.phone,
      person: data.person,
      message: data.message,
      syncedToConstantContact,
    });
  } catch (err) {
    console.error(
      "Failed to record contact form submission:",
      err instanceof Error ? err.message : err,
    );
  }

  // Send email notification to the site owner.
  console.log("[send-email] Attempting to send notification email...");
  try {
    await sendNotificationEmail({
      name: data.name,
      email,
      phone: data.phone,
      person: data.person,
      message: data.message,
    });
    console.log("[send-email] Notification email sent successfully.");
  } catch (err) {
    console.error(
      "[send-email] Failed to send notification email:",
      err instanceof Error ? err.message : err,
    );
  }

  return jsonResponse(
    { success: true, message: "Thanks — we'll be in touch soon." },
    200,
  );
}
