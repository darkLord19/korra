# HDFC Bank's official EDF form for service exports, and what RBI prescribes

**Date:** 2026-10-07 · **Primary sources:** RBI notification FEMA 23(R)/2026-RB (https://rbi.org.in/Scripts/BS_FemaNotifications.aspx?Id=13277); HDFC Bank's request letter for service-export EDF filing (https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/msme-banking/trade-service/fees-and-charges/pdfs/exports/edf-request-letter-tf-product.pdf); HDFC Bank's FEMA 23(R) policy and operational framework (https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/wholesale-banking/export-import-products/Policy-and-Operational-Framework-Export-and-Import-for-Goods-and-Services-under-FEMA-23-R.pdf)

## Question

Our HDFC layout is flagged `placeholder`, and the UI says "We do not have HDFC's official EDF format yet". Does HDFC Bank publish a real EDF form for services exports? What does RBI prescribe? How do other AD banks handle it?

## Headline

1. **HDFC does publish a form.** It is a one-page-plus request letter, "Request letter for Export of Services & EDF Filing Cum Disposal Instructions for Credit". It is linked on HDFC's trade-services forms page (https://www.hdfc.bank.in/msme-banking/trade-services/other-trade-services/fees-and-charges) as "EDF request letter TF Product". The PDF's `Last-Modified` header is 30 Sep 2026. A copy is committed at `docs/research/assets/hdfc-edf-request-letter-tf-product-2026-09-30.pdf` so we do not depend on the link staying live (HDFC labels it "Classification - Internal", but it is publicly linked; 759 KB, sha256 `fee74963ba1d3f860e714c2670683a2aeb63735994f9fb5b4ba0256f0a80db81`). Source URL: https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/msme-banking/trade-service/fees-and-charges/pdfs/exports/edf-request-letter-tf-product.pdf
2. **RBI prescribes the EDF content, not the wrapper.** Reg. 2(1)(c) defines the EDF as "the form given at Annex". Each bank adds its own cover letter and declarations around that Annex, and sets its own submission channel. HDFC's letter reproduces RBI's "Declaration 4" and "Section 5" verbatim, and its Part 2B table has the same columns except that the contract date is dropped.
3. **Not found:** the multi-invoice annexure that HDFC's letter refers to ("For more then 1 Invoice, Use Annexure"). HDFC does not publish it. This is the part Korra's XLSX replaces, so it is the one piece of the HDFC layout still unverified.

## Findings: what RBI prescribes

Verified from the RBI notification page (https://rbi.org.in/Scripts/BS_FemaNotifications.aspx?Id=13277):

1. **The form is fixed in the Annex.** Reg. 2(1)(c): "'Export Declaration Form' (EDF) means the form given at Annex".
2. **Services EDF timing and shape.** Reg. 3(2): "An exporter of services shall furnish to the specified authority, a declaration in EDF specifying the amount representing the full export value of services, within 30 days from the end of month in which invoice for services has been raised", and under (a) "the exporter of services who has exported services to one or more recipients in a month, may submit a single EDF for all such exports".
3. **Who receives it.** The "specified authority" for services is the Authorised Dealer (see the 2026-10-06 Deel note, finding 1).
4. **Nothing in the regulation text says how the EDF reaches the bank** (portal, paper, upload). That is left to the AD bank.
5. **SOFTEX is gone.** HDFC's policy says "Under these regulations, 'Services' shall also include software" and gives the 30-day EDF rule for software and non-software services alike (HDFC policy PDF, Section 2.3, item d). Its purpose-code list still carries a stale phrase, "Software consultancy/implementation (other than those covered in SOFTEX", so SOFTEX wording lingers in bank documents.
6. **Software exporters may also file with STPI.** Axis's policy lists "Software Technology Parks of India (STPI) in DTA" as the specified authority for software (Axis policy PDF, Part B, table row 3: https://www.axis.bank.in/docs/default-source/default-document-library/aexim-policy.pdf?sfvrsn=702b4492_2). Not relevant to Korra v1 (AD bank only).

**Blocked, not read directly.** The Annex PDF (https://rbidocs.rbi.org.in/rdocs/content/pdfs/NRAR23R16012026_AN.pdf), the notification PDF (https://rbidocs.rbi.org.in/rdocs/notification/PDFs/NRAR23R16012026C1272B8B66944ED5A53741840B973363.PDF) and the 22 Sep 2026 amendment gazette (https://rbidocs.rbi.org.in/rdocs/content/pdfs/GSFEMA23R25092026.pdf) all return a CAPTCHA page to curl and WebFetch. So:

- The Annex structure below is **triangulated** from three bank reproductions that agree with each other: Axis "Annexure 6 - Export Declaration Form" (https://www.axis.bank.in/docs/default-source/default-document-library/annexure-6-export-declaration-form.pdf?sfvrsn=167b10f9_1), ICICI's blank EDF (https://www.icici.bank.in/content/dam/icicibank/icici-assets/nri-banking/export-declaration-form-development.pdf), and HDFC's letter (verbatim "Declaration 4" and "Section 5").
- We have not confirmed whether the 22 Sep 2026 amendment touched the Annex. Someone with a browser should open the RBI PDF once and diff it.

### RBI Annex, as reproduced by Axis (Annexure 6)

| Part | Fields |
|---|---|
| 1. General information | Type of export; Form No.; Shipping Bill No. and Date; Mode of Transport/Delivery (Air, Land, Sea, Post/Couriers, Internet, others); Category of Exporter (Custom (DTA units), SEZ, 100% EOU, Warehouse export, others); AD code; IE Code; AD Name and Address; GSTIN; PAN; Exporter's Name and Address; Mode of Realisation (L/C, BG, Others (advance payment etc. including transfer/remittance to bank a/c maintained overseas)); Consignee Name and Address; Port of Loading / Source Port in case of SEZ; Third Party name and address; Relationship between Exporter and Third Party; Country of Final Destination; Port of Discharge; Name of the AD and AD code in case of LC/BG; Date of Let Export order (LEO); Description of Goods/Services; Total FOB/Services value in words (INR) |
| 2A. Goods | Per invoice: client, invoice no/date/currency/amount, contract no and date, nature of payment, HSN/SAC; value table (FOB/Services Value, Freight, Insurance, Commission, Discount, Other Deduction, Packing Charges, Full export value / Net Realisable export value). Not used for services |
| 2B. Services | Table "Details of services provided to multiple recipients": S. No., Service recipient Name and Address, Country, Details of Invoice (No., Date, Currency, Amount), Net Realisable value, Contract No., if any, and Date, Description of services, SAC Code, Remarks |
| 3. FPO/Couriers | Foreign post office/courier, parcel receipts, AD stamp and signature. Not used for services |
| 4. Declaration by the Exporters | "I/We hereby declare that I/we am/are the seller/consignor of the goods/provider of services in respect of which this declaration is made and that the particulars given above are true and that the value to be received from the buyer/third party represents the export value contracted and declared above. I/We undertake that I/we have delivered/will deliver to the authorised dealer named above the foreign exchange / Indian Rupees representing the full value of the goods/services exported as above on or before ........ (i.e. within the period of realisation stipulated by RBI from time to time) in the manner specified in the Regulations made under the Foreign Exchange Management Act, 1999. I/We also undertake to submit the documents pertaining to exports declared in this form, to the Authorised Dealer named above, as may be required under the Act." Then Date and signature |
| 5. Specified authority | "Certified, on the basis of above declaration at 4, that the goods/services described above and the export value declared by the exporter in this form is as per the corresponding invoice/gist of invoices submitted and declared by the exporter." Signed by the AD |

ICICI marks Part 1 type of export, mode of transport, category of exporter, PAN, exporter name and address, mode of realisation, description and total value in words as mandatory (`*`), and every 2B field except Remarks.

## Findings: HDFC's published form

Source: the HDFC PDF linked above, 2 pages, produced by "Microsoft: Print To PDF" from a workbook (PDF metadata title `EDF_request letter_TF Product.xlsx`). It is **not** a fillable PDF (`pdfinfo` reports `Form: none`), and the page is marked "Classification - Internal". I could not find a native `.xlsx` or `.docx` on HDFC's site (the `.xlsx`/`.xls` variants of the same URL return an HTML error page, and the forms page lists only PDFs).

**Values shown in the PDF are samples or defaults, not fields**: account `03333333333333`, `GSTIN: 12345`, invoice no `233455`, "YES" (third party), "Internet", "Custom (DTA units)", "Regular Export", "Non dispatch", "DD-MMM-YYYY".

### Header block, in order

1. To: HDFC BANK LTD, Branch; Date (DD-MMM-YYYY)
2. Account no. to be Credited
3. Purpose Code & Details
4. Exchange Rate / Forward Contract details if any
5. AD Code; IEC; GSTIN
6. Customer PAN
7. AD Name & Address
8. Exporter Name & Address
9. Type of Export (select from the list); Category of Export (a dropdown, showing "Regular Export")
10. Mode of Transport (select from the list; shows "Internet")
11. Category of Exporter (select from list; shows "Custom (DTA units)")
12. Mode of Realisation (shows "Others (advance payment, etc. including transfer/remittance to bank a/c maintained overseas)"); L/C No. (If Any); Country of Final Destination
13. Dispatch Indicator (select from list; shows "Non dispatch")
14. Date of Export / Expected date of Service for Advance (DD-MM-YYYY)
15. Description of Services
16. Total FOB Value (IN WORDS)
17. Third Party (Yes/No); Third Party Name & Address

### 2B table, "For more then 1 Invoice, Use Annexure" (4 blank rows on the form)

Sr no. | Service Recipient Name & Address | Country | Invoice No. | Invoice Date | Currency | Amount | net Realisable Value | Contract number if any | Description of Services | SAC Code | Remarks

(The header over the invoice columns reads "Details of Invoice".)

### After the table

1. "Debit all processing charges from account no (Mention Account number)"; contact telephone and email.
2. **OFAC Declaration:** "I/We hereby declare that the above transaction does not involve and is not designed for the purpose of any contravention or evasion of the provision of the OFAC."
3. **FEMA DECLARATION-CUM-UNDERTAKING:** "We are eligible to export the above mentioned goods under the extant Foreign Trade policy. I / We hereby declare that the above transaction does not involve, and is not designed for the purpose of any contravention or evasion of the provisions of the FEMA 1999 …" and so on, ending with "…on behalf of the firm/company." (The word "goods" is a leftover; the form then says "…the above mentioned Services under the current Foreign Trade policy in place".)
4. **Declaration 4:** the RBI Annex declaration, verbatim.
5. Remark (If Any); "For" (company); AUTHORISED SIGNATORY "(Signature as per Bank record with company seal)".
6. **5. Space for use of Specified Authority (Customs/SEZ/AD/STPI):** the RBI Annex certification text, verbatim.

### What HDFC's policy says about the process

From the policy PDF (Section 2, "Exports", item 3 "Export regularisation", row 1):

- Document list includes "d) Export Declaration Form (EDF*) for services (applicable in case Bank is the Specified Authority)", with the footnote "For export of service (software): Within 30 days from the end of the month in which invoice has been raised. For export of service (other than software): Within 30 days … or on or before the date of receipt of payment."
- "In case inward remittance is received from a 3rd party other than its overseas buyer, then details of 3rd party should be mentioned on the Export Declaration Form and other documentary evidence such as Tri-partite agreement, invoice/contract copy with details of 3rd party, etc. should be provided."
- "Documents may be submitted at the Trade Desk of your respective HDFC Bank Branch or through digital channel."
- Section 8: "Please submit documents by 3:00 pm for same day processing on a best effort basis". No EDF-specific turnaround is stated.
- The policy has **no mention of the ₹10 lakh declaration-based EDPMS closure** (Reg. 4(2) proviso) or any HDFC form for it. Its reduction clause says "reduction to the extent of 25% of the value shall be handled by the Bank", which is a different rule from Reg. 6's ₹10 lakh declaration route.
- HDFC's export-trade-services page (https://www.hdfc.bank.in/msme-banking/trade-services/export-trade-services) mentions only TradeOnNet "for managing export documentation, including shipping bills and bills of entry" (goods). I found no HDFC page that describes a services-EDF portal. Secondary blogs that name "Trade-E-Bank" as the EDF channel (e.g. https://blog.ramit.io/blog/hdfc-bank-exports-your-fema-23r-survival-guide/) admit they have no HDFC primary source, so I do not rely on them.

## Findings: other AD banks

| Bank | What is published | Source |
|---|---|---|
| **Axis** | Full policy plus a form library. Annexure 6 is the RBI Annex, with a header "In case of a Firm / Company this letter should be obtained on their letterhead". Documents for a services EDF: customer request letter (Annexure 1), the EDF ("including single EDF for multiple services"), and a service invoice/PO or underlying contract. Late filing: request letter, with a grace period of "additional 30 days". Signing: "EDF may be signed by any authorized company official and affixed with the company stamp… physical form or … scanned copy… a digitally signed EDF may also be accepted, provided the bank has adequate systems". Also: "Single EDF with file upload option for invoice wise details will be available in EDPMS covering multiple service recipients and multiple invoices for a calendar month". | Policy: https://www.axis.bank.in/docs/default-source/default-document-library/aexim-policy.pdf?sfvrsn=702b4492_2 (Part B, "EDF Procedure"); FAQs https://www.axis.bank.in/docs/default-source/default-document-library/faqs-for-export.pdf?sfvrsn=e7042434_1; index page https://www.axis.bank.in/business-banking/solution-for-importers/fema-export-import-policy |
| **SBI** | Policy v1.0 (28 Sep 2026) and customer guide (effective 01.10.2026), but **no EDF template**. Services checklist: "Request letter in Bank's standard format with FEMA declarations", service agreement/SOW, invoices, EDF, proof of service. EDF certification TAT "T+1". Late EDF: letter with reasons, 2 days. Small-value closure: "Declaration in Bank's format". | Guide: https://sbi.bank.in/documents/26274/33259/30092026_Customer_guide_SOP_for_Publishing.pdf (Sections 1, 2, 9, Annex 1); policy: https://sbi.bank.in/documents/26274/33259/30092026_Final_Policy_on_Export_Import_of_Goods_and_Services_MTT.pdf (A.1, A.3, A.13) |
| **ICICI** | A blank EDF in the RBI Annex layout, 3 pages, with the AD code and an IE code pre-filled (so it looks like a per-customer or draft render). It sits under `nri-banking/…-development.pdf`, so it may be a draft upload and I would not treat the URL as stable. Its 2B is a single-recipient vertical block, not a table. ICICI's e-SOFTEX page still describes SOFTEX bulk upload and does not mention EDF. | https://www.icici.bank.in/content/dam/icicibank/icici-assets/nri-banking/export-declaration-form-development.pdf ; https://www.icici.bank.in/business-banking/trade-solutions/digital-trade-solutions/e-softex |
| **Yes Bank** | Only a **goods** "Request Letter for Issuance of EDF - Shipping bill Waiver / EDF Approval" (PDF created Mar 2024). Not relevant to services. | https://www.yes.bank.in/sites/web/content/published/api/v1.1/assets/CONT1B2F3ECA3609413BB27B9B8FE03327E6/native/requestletterforissuanceofedf_shippingbillwaiveredfapproval.pdf |
| **Kotak, Standard Chartered, IDFC FIRST** | **Not found.** Searched kotak.bank.in, sc.com and idfcfirst.bank.in (including IDFC's trade form-centre, which lists only EPC/PCFC, inward-remittance disposal and export-bill-collection letters). Their trade portals may be login-gated. | https://www.kotak.bank.in/en/business/trade-services/international-exports/features.html ; https://www.idfcfirst.bank.in/business-banking/export ; https://www.sc.com/in/business-global-banking/import-and-export-services/ |
| **FEDAI** | **Not found.** No FEDAI circular on a uniform EDF wrapper turned up. | (searched) |

The pattern across HDFC, Axis and SBI is the same: RBI fixes the Annex, and the bank wraps it in a request letter with FEMA declarations. HDFC's wrapper merges the EDF with "Disposal Instructions for Credit", so the same sheet also carries the credit account, purpose code and forward-contract fields.

## Comparison with the current HDFC placeholder

Current `packages/packs/layouts/hdfc@0.json` columns (16): Exporter legal name, Exporter address, PAN, GSTIN, IEC, Invoice no, Invoice date, Client name, Client address, Client country, Currency, Invoice amount, Net realisable value, Contract ref, Service description, SAC code. The JSON is identical to the ICICI and generic columns, so the "HDFC" layout is really the generic one.

| # | Difference | HDFC's form | Current layout |
|---|---|---|---|
| 1 | Row identifier | `Sr no.` first | None |
| 2 | Column order | Recipient, Country, then invoice no/date/currency/amount, NRV, contract, description, SAC, Remarks | Exporter block first, then invoice no/date, then client, then amount |
| 3 | Recipient name and address | One cell, "Service Recipient Name & Address" | Two columns (Client name, Client address) |
| 4 | Exporter PAN, GSTIN, IEC, name, address | Header fields, once per form | Repeated on every row |
| 5 | Contract | "Contract number if any" (the RBI Annex says "No., if any, and Date") | "Contract ref" only |
| 6 | Remarks | Last column | Missing |
| 7 | Header-level fields we do not produce | Branch; form Date; Account to be Credited; Purpose Code & Details; Exchange Rate / Forward Contract; AD Name & Address; Type of Export; Category of Export; Mode of Transport; Category of Exporter; Mode of Realisation; L/C No.; Country of Final Destination; Dispatch Indicator; Date of Export; Third Party Y/N, name and address; debit-charges account; contact telephone and email; Remark | Not in the XLSX (the pack carries only AD bank name and AD code) |
| 8 | **Total in words, in INR** | "Total FOB Value (IN WORDS)"; the RBI Annex says "Total FOB/Services value in words (INR)" | Not produced. The EDF rows carry only invoice-currency amounts, so this needs an INR figure and a rate source |
| 9 | Declarations | OFAC; FEMA declaration-cum-undertaking; Declaration 4; signatory "as per Bank record with company seal"; Section 5 for the AD | PDF has no declaration or signature block (it prints rows and totals) |
| 10 | Multi-invoice | A 4-row table, "Use Annexure" for more; annexure format not published | One XLSX of all rows |
| 11 | Delivery | Trade Desk at a branch, or "digital channel" | Guide says "HDFC Bank's trade or forex portal, or contact your relationship manager" (portal claim unsupported) |
| 12 | PDF rendering | A letter with header block, declarations and signature block | Generic row table from hard-coded `COLS` in `pdf.ts`; the layout JSON drives only the XLSX columns and the guide, so `placeholder: false` would only hide the red banner |

## Residual uncertainty

1. **The annexure.** HDFC's letter says to use an annexure for more than one invoice but publishes none. The Korra XLSX would stand in for it. Whether a branch accepts an exporter's own sheet is a bank-by-bank question for the week-1 calls.
2. **Native file and sample values.** The published PDF is a print of a workbook with dropdowns we cannot see. The dropdown values for Type of Export, Category of Export, Category of Exporter and Dispatch Indicator are unknown, apart from the defaults shown.
3. **Channel.** HDFC says "digital channel" without naming it for services. Ask the Trade Desk.
4. **RBI Annex vs the 22 Sep amendment.** Not confirmed (see "Blocked" above).
5. **Third parties and Deel local transfers.** HDFC asks for third-party details on the EDF "in case inward remittance is received from a 3rd party". This ties into the Deel note's Q1: a platform payout partner may need to be listed as a third party. That is a product decision, not a research finding.
6. **Realisation declaration.** HDFC's policy has no ₹10 lakh declaration form, so `declaration-hdfc` stays a best-effort layout (Reg. 4(2) text in the Deel note).

## Related items (outside the HDFC layout)

1. **`declaration-hdfc@0` stays a placeholder.** HDFC publishes no form for the Reg. 4(2) / Reg. 6 declarations, and its reduction policy does not mention the ₹10 lakh route. Also correct the comment in `declaration.ts` ("RBI prescribes no format") so it applies to the realisation declaration only. For the EDF, RBI does prescribe the Annex.
2. **ICICI and Axis** both publish the RBI Annex (ICICI's blank EDF, Axis Annexure 6). ICICI's single-recipient 2B block is a different shape from HDFC's table. Re-check each layout against its own bank's form before dropping their `placeholder` flags.
3. **Human verification:** open the RBI Annex PDF (https://rbidocs.rbi.org.in/rdocs/content/pdfs/NRAR23R16012026_AN.pdf) in a browser to clear the CAPTCHA, and diff it against Axis Annexure 6 and HDFC's text. Ask the HDFC Trade Desk for the annexure format and the name of the digital channel.

## Recommendation

1. **Do not just flip `placeholder` to `false`.** The flag only removes the red "not verified" banner in `pdf.ts`; the PDF would still not be HDFC's letter. Drop it only after one of these:
   - (a) the HDFC PDF renders HDFC's request-letter structure (header block, the 2B table with up to 4 rows on page 1 and the rest on an annexure page, OFAC and FEMA declarations, Declaration 4, signature block, blank Section 5), or
   - (b) the guide tells the user to fill HDFC's own letter and attach Korra's sheet as the annexure.
2. **Ship `hdfc@1`** (bump the version so earlier packs stay reproducible) with HDFC's 2B column order: Sr no, Recipient name and address (one cell), Country, Invoice no, Invoice date, Currency, Amount, Net realisable value, Contract no and date, Description of services, SAC code, Remarks. Move exporter PAN, GSTIN, IEC, name and address to a header block.
3. **Add the header values we can supply** to the pack model: type of export, category of export, mode of transport, category of exporter, mode of realisation, country of final destination, dispatch indicator, third party Y/N, purpose code, and a total in INR in words (needs the FX source decision from the Deel note). Leave account to be credited and forward-contract fields to the user.
4. **Fix the HDFC guide wording:** "submit at the Trade Desk of your HDFC Bank branch or through HDFC's digital channel" (HDFC policy wording); drop "trade or forex portal". List the packet as the EDF request letter plus the service invoice/PO or contract. Note that HDFC does not publish its multi-invoice annexure format.
5. **Reword the UI note** to something like: "Follows HDFC's published EDF request letter (30 Sep 2026). HDFC does not publish its multi-invoice annexure, so ask your branch if it wants a different one."
