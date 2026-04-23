CREATE TABLE IF NOT EXISTS "image_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"enhanced_prompt" text,
	"style" text DEFAULT 'photorealistic' NOT NULL,
	"width" integer DEFAULT 1024 NOT NULL,
	"height" integer DEFAULT 1024 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"image_url" text,
	"provider" text DEFAULT 'dalle3' NOT NULL,
	"error" text,
	"cost_credits" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "image_jobs_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_jobs_company_created_idx" ON "image_jobs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_jobs_company_status_idx" ON "image_jobs" USING btree ("company_id","status");
