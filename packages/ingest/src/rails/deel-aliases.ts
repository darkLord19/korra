/**
 * Deel transaction-export column aliases.
 *
 * !!! THESE ARE GUESSES. !!!
 * The real Deel export column names are NOT confirmed (design doc open question Q2). This table
 * covers plausible spellings so the parser degrades gracefully. It MUST be reviewed and updated
 * against a real sample export. Fixtures for that go in `packages/ingest/fixtures/deel/`
 * (the synthetic file there is hand-made from this table and proves nothing about Deel's format).
 *
 * Matching is case-, space- and punctuation-insensitive ("Received_Amount" == "received amount").
 * Within a group the first alias that appears in the file wins, so order = priority.
 * When the real format is known: replace/trim these lists, keep the logical keys.
 */
import type { AliasTable } from "./rail";

export type DeelColumn =
  | "date"
  | "type"
  | "amount"
  | "currency"
  | "fee"
  | "receivedAmount"
  | "receivedCurrency"
  | "fxRate"
  | "method"
  | "reference"
  | "payer";

export const DEEL_ALIASES: AliasTable<DeelColumn> = {
  date: ["date", "transaction date", "created at", "completed at"],
  type: ["type", "transaction type", "description"],
  amount: ["amount", "withdrawal amount", "gross amount"],
  currency: ["currency", "amount currency"],
  fee: ["fee", "fees", "transfer fee"],
  receivedAmount: ["received amount", "amount received", "payout amount", "net amount"],
  receivedCurrency: [
    "received currency",
    "payout currency",
    "receiving currency",
    "received amount currency",
  ],
  fxRate: ["exchange rate", "fx rate", "rate"],
  method: ["method", "withdrawal method", "payout method", "transfer type"],
  reference: ["reference", "transaction id", "id"],
  payer: ["client", "company", "from", "payer"],
};
