-- Align video_renders with Remotion video studio (Bonus 18)
ALTER TABLE "video_renders" RENAME COLUMN "type" TO "composition_id";--> statement-breakpoint
ALTER TABLE "video_renders" RENAME COLUMN "input_data" TO "props";--> statement-breakpoint
ALTER TABLE "video_renders" RENAME COLUMN "output_url" TO "output_path";--> statement-breakpoint
ALTER TABLE "video_renders" RENAME COLUMN "error_message" TO "error";--> statement-breakpoint
ALTER TABLE "video_renders" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
UPDATE "video_renders" SET "status" = 'queued' WHERE "status" = 'pending';--> statement-breakpoint
UPDATE "video_renders" SET "status" = 'completed' WHERE "status" = 'complete';--> statement-breakpoint
ALTER TABLE "video_renders" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "video_renders" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "video_renders" DROP COLUMN IF EXISTS "updated_at";
