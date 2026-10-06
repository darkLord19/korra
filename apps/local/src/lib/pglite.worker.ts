// Dedicated worker for PGliteWorker (the shared implementation lives in @korra/db/browser). One per tab: the
// workers elect a leader (Web Locks) and only the leader's PGlite has the IndexedDB store open.
import { startKorraPgliteWorker } from "@korra/db/browser";

void startKorraPgliteWorker();
