ALTER TABLE "ad_bank" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "ad_bank" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "exporter_profile" ADD COLUMN "signatory_name" text;--> statement-breakpoint
ALTER TABLE "exporter_profile" ADD COLUMN "signatory_designation" text;--> statement-breakpoint
ALTER TABLE "exporter_profile" ADD COLUMN "signature_blob_key" text;--> statement-breakpoint
ALTER TABLE "exporter_profile" ADD COLUMN "seal_blob_key" text;