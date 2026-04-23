CREATE TABLE "reseller_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"partner_code" text NOT NULL,
	"stripe_connect_account_id" text,
	"stripe_connect_status" text DEFAULT 'pending' NOT NULL,
	"commission_percent" integer DEFAULT 20 NOT NULL,
	"total_client_count" integer DEFAULT 0 NOT NULL,
	"total_mrr_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reseller_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"stripe_subscription_id" text,
	"commission_percent" integer DEFAULT 20 NOT NULL,
	"active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reseller_clients" ADD CONSTRAINT "reseller_clients_reseller_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."reseller_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_clients" ADD CONSTRAINT "reseller_clients_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_partners_email_idx" ON "reseller_partners" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_partners_partner_code_idx" ON "reseller_partners" USING btree ("partner_code");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_partners_stripe_account_idx" ON "reseller_partners" USING btree ("stripe_connect_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_clients_company_id_idx" ON "reseller_clients" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "reseller_clients_reseller_id_idx" ON "reseller_clients" USING btree ("reseller_id");--> statement-breakpoint
CREATE INDEX "reseller_clients_subscription_id_idx" ON "reseller_clients" USING btree ("stripe_subscription_id");
