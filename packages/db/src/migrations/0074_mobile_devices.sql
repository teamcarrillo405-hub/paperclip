CREATE TABLE "mobile_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"device_token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_devices_device_token_idx" ON "mobile_devices" USING btree ("device_token");--> statement-breakpoint
CREATE INDEX "mobile_devices_user_id_idx" ON "mobile_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mobile_devices_company_id_idx" ON "mobile_devices" USING btree ("company_id");
