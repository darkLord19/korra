# Generic payment CSV template

One row per payment received. Header names are matched case-insensitively and ignoring spaces/underscores, but please use these exactly.

| Column | Required | Format | Notes |
|---|---|---|---|
| `date` | yes | `YYYY-MM-DD` (preferred), `DD/MM/YYYY`, `Oct 3, 2026` | Date the money was received. Ambiguous `01/02/2026` is read as DD/MM and flagged for review. |
| `amount` | yes | `1,234.56` or `$1,234.56` | Foreign-currency amount received. |
| `currency` | yes | ISO 4217, e.g. `USD` | Currency of `amount` and `fees`. |
| `inr_credited` | no | `208,750.00` | INR credited to your account. |
| `fx_rate` | no | `83.50` | INR per 1 unit of foreign currency. |
| `fees` | no | `10.00` | Fees deducted, in `currency`. |
| `fira_ref` | no | text | FIRA / remittance reference from your bank. |
| `purpose_code` | no | e.g. `P0802` | RBI purpose code from the FIRA. |
| `payer` | no | text | Client / remitter name. |
| `receipt_mode` | no | `local_transfer` or `swift` | Blank is allowed (flagged for review). |
| `bank` | no | text | Bank where the foreign remittance landed. |

Missing optional columns are fine. If `date`, `amount` or `currency` is missing the file is not recognised and returns `kind: "unknown"` with a warning listing the headers found.
