# ADR-0001: LLM extraction outside India

**Status:** Accepted 2026-10-06

## Context

PRD §11 asks for data to be stored in India and for documents not to be used for model training. Reading invoices, FIRAs and NOCs (PDFs and images) needs a vision-capable LLM, and the provider we use (Anthropic) processes requests outside India. Storage and compute stay in Mumbai (Supabase ap-south-1, Vercel bom1), but the document content leaves India for the duration of an extraction call.

## Decision

- Allow Anthropic extraction for PDFs and images.
- `KORRA_LLM_ENABLED=false` is a kill switch: extraction is skipped, the document is marked unreadable and the user enters the values by hand.
- CSV and XLSX rail exports are parsed locally and never sent to an LLM.
- Seek zero-data-retention terms with the provider before public launch. Until then, user-facing copy must not claim zero retention.
- User-facing copy (Settings, "Your data") states plainly that PDFs and images are sent to an AI provider outside India, that documents are not used to train models, and where data is stored.

## Consequences

- PRD §11 "data stored in India" holds for storage, not for transient LLM processing. The PRD wording should be read with this ADR.
- Users who cannot accept this can use CSV rails or enter data manually (kill switch for the whole deployment only; there is no per-user switch yet).
- Provider-side retention is outside our control until ZDR terms are in place. Revisit before the public launch.
