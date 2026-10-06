# Deel local INR transfers and EDPMS closure (open question Q1)

**Date:** 2026-10-06 · **Primary source:** FEMA 23(R)/2026-RB (Foreign Exchange Management (Export and Import of Goods and Services) Regulations, 2026), as amended by FEMA 23(R)/(1)/2026-RB dated 22 Sep 2026, published in the Gazette on 24 Sep 2026. Text taken from the RBI site: https://rbi.org.in/Scripts/BS_FemaNotifications.aspx?Id=13277

## Question

When a Deel contractor withdraws by **local transfer**, Deel's payout partner pays INR into the exporter's bank account as a domestic credit, so the exporter's own AD bank never sees a foreign inward remittance.

The EDF is filed with an AD bank, which logs the export in EDPMS and closes the entry once the money is realised. How does that entry close when the money arrived this way?

## Findings (verbatim from the regulation)

1. **Any AD bank may receive the EDF.**
   - Reg. 2(1)(f)(ii) defines the "specified authority" for services as "An Authorised Dealer in DTA…".
   - Reg. 3(2) requires the EDF "within 30 days from the end of month in which invoice for services has been raised".
   - Nothing in the regulation ties the EDF to the bank that receives the proceeds.
2. **Normal closure happens when the AD bank credits the export proceeds.** Reg. 4(2): the AD bank credits the exporter "only after having satisfied itself of the genuineness of the transaction, and shall, simultaneously close or update the respective entry in … EDPMS".
3. **Small invoices close on the exporter's declaration (this answers Q1).** Reg. 4(2), proviso:
   > "in the case of export where the … invoice (for services) is up to ₹10 lakh (or its equivalent in foreign currency), entry in EDPMS may be closed based on a declaration from the exporter to the effect that the payment against the … invoice has been realised either in full or otherwise. Alternatively, such declaration may be submitted by an exporter to the Authorised Dealer on a quarterly basis for bulk closure of entries in EDPMS"
4. **Third-party receipts are allowed at the AD bank's discretion.** Reg. 8: "An Authorised Dealer may permit third party … receipts … for export … transactions provided that the Authorised Dealer is satisfied with the bonafides of the transactions."
5. **Short-paid or unpaid invoices.**
   - Reg. 6: a reduction in export value, including non-realisation, "where the export value is up to ₹10 lakh … per … invoice (for services) … may be permitted based on a declaration from the exporter".
   - Above ₹10 lakh it is at the AD bank's discretion.
6. **Realisation period: 9 months from the invoice date, or 12 months for INR-invoiced or INR-settled exports** (Reg. 5(1)(a) and its proviso).
   - The 22 Sep 2026 amendment replaced "fifteen months" with "nine months" and "eighteen months" with "twelve months", before the rules came into force on 1 Oct 2026.
   - Secondary sources written before September 2026, such as the KPMG Tax Flash of 19 Jan 2026, still say 15 and 18 months. They are out of date.
7. **Optional EDF timing.** Reg. 3(2)(b): "the exporter of services other than software, may submit an EDF on or before the date of receipt of payment". This is an alternative timing for non-software services. The default deadline of 30 days after month-end is always compliant, and that is what Korra uses.

## Answer to Q1

1. **Where to file:** the exporter files the EDF with their own AD bank, the same as for any other invoice.
2. **Invoices up to ₹10 lakh (or the foreign-currency equivalent):**
   - The bank closes the EDPMS entry on the exporter's declaration that the invoice has been realised. No FIRA is needed.
   - The declaration can be sent invoice by invoice, or as a quarterly bulk declaration.
   - Nearly all freelancer invoices fall in this case. ₹10 lakh is roughly USD 11–12k.
3. **Invoices above ₹10 lakh paid by Deel local transfer:**
   - Closure is up to the AD bank. It can accept the receipt as a third-party receipt under Reg. 8, backed by evidence such as the Deel invoice, the Deel withdrawal record and Deel's NOC.
   - If the bank won't accept that, withdrawing that payment by **SWIFT** gets the exporter's own bank to issue a FIRA, which closes the entry in the normal way.
   - Korra should warn about this case. It should not block anything.

## Residual uncertainty (needs a bank or CA, but does not block the product)

1. **Does it count as realisation?** Whether an INR domestic credit from a platform's payout partner counts as "realised and repatriated" under the Manner of Receipt and Payment Regulations, 2023 is still open.
   - The ₹10 lakh declaration route lets the exporter declare realisation without the bank checking how the money arrived.
   - The exporter still has to make that declaration truthfully.
2. **Deel's payout partner.** We have not confirmed which entity carries Deel's India payouts.
   - If it is a cross-border payment aggregator (PA-CB), RBI's PA-CB circular (31 Oct 2023), para 8.4, makes the AD bank holding that aggregator's export collection account responsible for EDPMS reporting and reconciliation.
   - A secondary source says Deel is not a PA-CB. That is unverified.
3. **Bank practice.** Banks may set their own declaration formats and evidence requirements (Reg. 4(2) and the Master Direction leave room for internal policy). Collecting these is part of the week-1 work in the launch plan.

## Product implications

1. **Realisation declaration pack.** For each AD bank, generate the exporter's declaration under Reg. 4(2) for realised invoices of up to ₹10 lakh, as a quarterly bulk declaration or one per invoice. It should list the invoice, the EDF month, the amount realised and the evidence (Deel withdrawal reference and date). This closes the gap for local-transfer users and is a natural next step after the EDF pack.
2. **₹10 lakh check.**
   - Convert each invoice amount to INR at the invoice date and flag invoices above ₹10 lakh whose payments arrived by `local_transfer`.
   - The message should suggest SWIFT, or asking the bank about third-party receipt under Reg. 8.
   - The exchange-rate source needs a decision (the RBI reference rate is the obvious choice).
3. **Under-paid invoices.** A Reg. 6 reduction declaration for invoices up to ₹10 lakh that were short-paid, for example because of platform fees, or never paid.
4. **No change to the EDF pack.** The pack is still invoice-only.
