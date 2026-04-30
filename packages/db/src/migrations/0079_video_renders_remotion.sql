-- Align video_renders with Remotion video studio (Bonus 18)
-- Idempotent: guards against columns already renamed in a prior session
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_renders' AND column_name='type') THEN
    ALTER TABLE "video_renders" RENAME COLUMN "type" TO "composition_id";
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_renders' AND column_name='input_data') THEN
    ALTER TABLE "video_renders" RENAME COLUMN "input_data" TO "props";
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_renders' AND column_name='output_url') THEN
    ALTER TABLE "video_renders" RENAME COLUMN "output_url" TO "output_path";
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_renders' AND column_name='error_message') THEN
    ALTER TABLE "video_renders" RENAME COLUMN "error_message" TO "error";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "video_renders" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
UPDATE "video_renders" SET "status" = 'queued' WHERE "status" = 'pending';--> statement-breakpoint
UPDATE "video_renders" SET "status" = 'completed' WHERE "status" = 'complete';--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_renders' AND column_name='duration_ms') THEN
    ALTER TABLE "video_renders" ADD COLUMN "duration_ms" integer;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_renders' AND column_name='completed_at') THEN
    ALTER TABLE "video_renders" ADD COLUMN "completed_at" timestamp with time zone;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "video_renders" DROP COLUMN IF EXISTS "updated_at";
