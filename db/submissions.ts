// db/submissions.ts
//
// Server-side data-access helper for recording contact form submissions,
// including the `person` and `message` fields that have no home in the
// Constant Contact contact record. Imported only by Netlify Functions.
import { db } from "./index.js";
import { contactFormSubmissions } from "./schema.js";

export interface ContactFormSubmissionInput {
  name?: string;
  email: string;
  phone?: string;
  person?: string;
  message?: string;
  syncedToConstantContact: boolean;
}

// Records a submission. Called regardless of whether the Constant Contact
// sync succeeded, so the site owner has a durable record of every inquiry
// even if Constant Contact is temporarily unreachable.
export async function recordContactFormSubmission({
  name,
  email,
  phone,
  person,
  message,
  syncedToConstantContact,
}: ContactFormSubmissionInput): Promise<void> {
  await db.insert(contactFormSubmissions).values({
    name,
    email,
    phone,
    person,
    message,
    syncedToConstantContact,
  });
}
