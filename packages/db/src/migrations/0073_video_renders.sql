CREATE TABLE "video_renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_renders" ADD CONSTRAINT "video_renders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_renders_company_created_idx" ON "video_renders" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "video_renders_company_status_idx" ON "video_renders" USING btree ("company_id","status");
