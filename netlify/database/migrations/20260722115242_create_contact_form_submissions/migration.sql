CREATE TABLE "contact_form_submissions" (
	"id" serial PRIMARY KEY,
	"name" text,
	"email" text NOT NULL,
	"phone" text,
	"person" text,
	"message" text,
	"synced_to_constant_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
