// db/schema.ts
import { pgTable, integer, text, timestamp, serial, boolean } from "drizzle-orm/pg-core";

// Stores the OAuth token set for the single Constant Contact account this site
// integrates with. The table holds exactly one row (a singleton, id = 1); the
// callback function creates it and the refresh flow updates it in place.
export const constantContactTokens = pgTable("constant_contact_tokens", {
  // Fixed singleton primary key. There is only ever one Constant Contact
  // account, so all reads and writes target id = 1.
  id: integer().primaryKey().default(1),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  // Absolute expiry instant of the access token.
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Last time this row was written (initial save or token refresh).
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Captures the full contact form submission, including the `person` and
// `message` fields that the Constant Contact "sign up form" contact record
// has no place for. This is the site owner's record of what a visitor
// actually asked, independent of whatever happens with the Constant Contact
// sync (a submission is recorded even if the Constant Contact call fails).
export const contactFormSubmissions = pgTable("contact_form_submissions", {
  id: serial().primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  phone: text("phone"),
  // Who the inquiry is for: "myself" | "family-member" | "client-patient".
  person: text("person"),
  message: text("message"),
  // Whether this submission was successfully synced to the Constant Contact
  // Website Leads list.
  syncedToConstantContact: boolean("synced_to_constant_contact")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
