CREATE TABLE IF NOT EXISTS "email_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "to" text NOT NULL,
  "from" text NOT NULL,
  "subject" text NOT NULL,
  "template_name" text,
  "status" text DEFAULT 'sent' NOT NULL,
  "message_id" text,
  "provider" text DEFAULT 'postal' NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_sends_company_id_idx" ON "email_sends" ("company_id");
CREATE INDEX IF NOT EXISTS "email_sends_created_at_idx" ON "email_sends" ("created_at");
