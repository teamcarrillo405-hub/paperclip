CREATE TABLE "chat_widget_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"visitor_name" text,
	"visitor_email" text,
	"visitor_phone" text,
	"page_url" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lead_captured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_widget_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"welcome_message" text DEFAULT 'Hi! How can we help you today?' NOT NULL,
	"agent_name" text DEFAULT 'Avero AI' NOT NULL,
	"brand_color" text DEFAULT '#2563eb' NOT NULL,
	"collect_email" boolean DEFAULT true NOT NULL,
	"collect_phone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_widget_sessions" ADD CONSTRAINT "chat_widget_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_widget_settings" ADD CONSTRAINT "chat_widget_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_widget_sessions_session_id_idx" ON "chat_widget_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_widget_sessions_company_created_idx" ON "chat_widget_sessions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_widget_sessions_company_lead_idx" ON "chat_widget_sessions" USING btree ("company_id","lead_captured");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_widget_settings_company_id_idx" ON "chat_widget_settings" USING btree ("company_id");
