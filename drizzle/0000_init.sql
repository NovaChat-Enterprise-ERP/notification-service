CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE TABLE "notifications"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp (6) with time zone,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."preferences" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"level" text DEFAULT 'all' NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications"."notifications" USING btree ("workspace_id","user_id","created_at" DESC NULLS LAST);