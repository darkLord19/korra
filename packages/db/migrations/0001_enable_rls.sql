-- Defence in depth: only the server connects (pooler, server-side). RLS on with no policies = deny-all for anon/authenticated.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "exporter_profile" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ad_bank" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "allocation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pack" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "field_edit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ca_share" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;
