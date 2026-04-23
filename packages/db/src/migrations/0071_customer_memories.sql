CREATE TABLE "customer_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"email" text,
	"phone" text,
	"memories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment_score" double precision,
	"lifetime_value" double precision DEFAULT 0 NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_memories" ADD CONSTRAINT "customer_memories_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_memories_company_idx" ON "customer_memories" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_memories_email_idx" ON "customer_memories" USING btree ("email");
