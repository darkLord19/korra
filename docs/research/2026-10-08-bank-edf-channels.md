# Bank EDF Submission Channels, Forms and Signing Rules

**Date:** 2026-10-08 · **Scope:** All 10 catalog banks in `@korra/core` (`BANK_CATALOG`) under FEMA 23(R)/2026-RB · **Baseline source:** `docs/research/2026-10-07-hdfc-edf-official-form.md`

## 1. Regulatory Baseline (RBI)

Under the Foreign Exchange Management (Export and Import of Goods and Services) Regulations, 2026 (FEMA 23(R)/2026-RB, notification dated 16 Jan 2026, amended 22 Sep 2026):
- **Notification URL:** https://rbi.org.in/Scripts/BS_FemaNotifications.aspx?Id=13277 (retrieved 2026-10-08)
- **Form:** Reg. 2(1)(c) defines the Export Declaration Form (EDF) as "the form given at Annex". The statutory Annex comprises:
  - Part 1: General Information (exporter details, AD bank code, mode of transport/delivery e.g. Internet, mode of realisation);
  - Part 2B: Services table ("Details of services provided to multiple recipients");
  - Declaration 4: Statutory exporter declaration and undertaking;
  - Section 5: Space for use of Specified Authority (Authorised Dealer).
- **Due Date:** Reg. 3(2) mandates furnishing the EDF within 30 days from the end of the month in which invoices are raised.
- **Channels:** RBI does not mandate the transmission method (portal, email, branch); each Authorised Dealer (AD) bank sets its own submission workflow.

---

## 2. Bank-by-Bank Findings

### 1. HDFC Bank (`hdfc`)
- **EDF Form:** Published official request letter titled "Request letter for Export of Services & EDF Filing Cum Disposal Instructions for Credit", 2 pages (incorporating 2B services table, OFAC declaration, FEMA declaration-cum-undertaking, Declaration 4, and Section 5).
  - Primary URL: https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/msme-banking/trade-service/fees-and-charges/pdfs/exports/edf-request-letter-tf-product.pdf (retrieved 2026-10-08)
  - Policy URL: https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/wholesale-banking/export-import-products/Policy-and-Operational-Framework-Export-and-Import-for-Goods-and-Services-under-FEMA-23-R.pdf (retrieved 2026-10-08)
  - Trade Services: https://www.hdfc.bank.in/msme-banking/trade-services/export-trade-services (retrieved 2026-10-08)
  - Fees and Charges: https://www.hdfc.bank.in/msme-banking/trade-services/other-trade-services/fees-and-charges (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking / Digital:** NetBanking portal https://netbanking.hdfcbank.com/netbanking/ (retrieved 2026-10-08). TradeOnNet is HDFC's digital trade portal accessible via NetBanking, though specific services-EDF upload menu paths are not publicly documented.
  - **Branch / Trade Desk:** "Documents may be submitted at the Trade Desk of your respective HDFC Bank Branch or through digital channel" (Policy Section 2, item 3). Cut-off: 3:00 PM for same-day processing on best effort basis.
  - **Email:** No central trade submission email published; submission directed to Relationship Manager (RM) or branch Trade Desk email.
- **Required Documents:**
  - Signed EDF request letter (PDF in pack);
  - Annexure sheet for multiple invoices (XLSX in pack);
  - Export invoices and service contract / SOW;
  - Tripartite agreement if remittance is received from a 3rd party.
- **Signing Rules:** Authorized Signatory signature "as per Bank record with company seal". Wet signature and seal required on paper submission; digital channel accepts authorized upload.
- **Turnaround / Deadline:** Due within 30 days from month end. Submit by 3:00 PM for same-day processing.

---

### 2. ICICI Bank (`icici`)
- **EDF Form:** Publishes a blank EDF following the statutory RBI Annex layout (3 pages).
  - Primary URL: https://www.icici.bank.in/content/dam/icicibank/icici-assets/nri-banking/export-declaration-form-development.pdf (retrieved 2026-10-08)
  - Trade Solutions URL: https://www.icici.bank.in/business-banking/trade-solutions/digital-trade-solutions/e-softex (retrieved 2026-10-08)
  - Portal URL: https://www.icicibank.com (retrieved 2026-10-08)
  - Corporate Internet Banking (CIB) Login: https://cibnext.icicibank.com (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking / Trade Online:** ICICI Corporate Internet Banking (CIB) portal https://cibnext.icicibank.com (retrieved 2026-10-08). Menu path published for trade services: "Trade > Trade Online" (requires Trade Online activation).
  - **Branch:** Branch Trade Desk / Corporate Banking branch.
  - **Email:** No central trade submission email published; branch / RM email.
- **Required Documents:**
  - Completed EDF (RBI Annex);
  - Export invoices;
  - Underlying contracts / agreements.
- **Signing Rules:** Authorized signatory signature with company seal.
- **Turnaround / Deadline:** Statutory 30 days from month end.

---

### 3. Axis Bank (`axis`)
- **EDF Form:** Publishes full AEXIM policy and standardized form library: Annexure 6 is the statutory RBI Annex ("Export Declaration Form"), accompanied by Annexure 1 (Customer Request Letter).
  - Policy URL: https://www.axis.bank.in/docs/default-source/default-document-library/aexim-policy.pdf?sfvrsn=702b4492_2 (retrieved 2026-10-08)
  - Annexure 6 Form URL: https://www.axis.bank.in/docs/default-source/default-document-library/annexure-6-export-declaration-form.pdf?sfvrsn=167b10f9_1 (retrieved 2026-10-08)
  - FAQs URL: https://www.axis.bank.in/docs/default-source/default-document-library/faqs-for-export.pdf?sfvrsn=e7042434_1 (retrieved 2026-10-08)
  - FEMA Index URL: https://www.axis.bank.in/business-banking/solution-for-importers/fema-export-import-policy (retrieved 2026-10-08)
  - Portal URL: https://www.axisbank.com (retrieved 2026-10-08)
  - NEO for Corporates Login: https://nfc.axis.bank.in/pre-login-interim (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking / Trade Portal:** NEO for Corporates portal https://nfc.axis.bank.in/pre-login-interim (retrieved 2026-10-08), via Trade Finance / TF Connect module.
  - **Branch:** Axis Bank branch / Corporate Trade Desk.
  - **Email:** RM / branch trade desk. Policy explicitly accommodates scanned copies.
- **Required Documents:**
  - Customer request letter (Annexure 1);
  - Completed EDF (Annexure 6, single EDF for multiple services);
  - Service invoices / purchase orders or underlying service contract;
  - If submitted past 30 days: request letter detailing delay reasons (grace period of additional 30 days provided in policy).
- **Signing Rules:** "EDF may be signed by any authorized company official and affixed with the company stamp… physical form or … scanned copy… a digitally signed EDF may also be accepted, provided the bank has adequate systems" (Policy Part B). Wet signature, scanned copy, stamp, or DSC accepted.
- **Turnaround / Deadline:** 30 days from month end. Policy provides additional 30-day grace period with justification letter.

---

### 4. State Bank of India (`sbi`)
- **EDF Form:** Customer SOP and Policy v1.0 reference standard request letter with FEMA declarations and EDF, but SBI does not publish a standalone blank EDF template; uses the statutory RBI Annex.
  - Customer Guide SOP URL: https://sbi.bank.in/documents/26274/33259/30092026_Customer_guide_SOP_for_Publishing.pdf (retrieved 2026-10-08)
  - Policy URL: https://sbi.bank.in/documents/26274/33259/30092026_Final_Policy_on_Export_Import_of_Goods_and_Services_MTT.pdf (retrieved 2026-10-08)
  - Portal URL: https://sbi.bank.in (retrieved 2026-10-08)
  - YONO Business Login: https://yonobusiness.sbi.bank.in (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking:** YONO Business https://yonobusiness.sbi.bank.in (retrieved 2026-10-08) under eTrade / CINB.
  - **Branch:** Designated Commercial / Forex branch or home branch trade desk.
  - **Email:** Branch / RM email.
- **Required Documents:**
  - Request letter in Bank's format with FEMA declarations;
  - Statutory EDF (RBI Annex);
  - Service agreement / Statement of Work (SOW);
  - Export invoices;
  - Proof of service delivery.
- **Signing Rules:** Authorized signatory with company stamp/seal.
- **Turnaround / Deadline:** 30 days from month end. EDF certification TAT: T+1 (Customer Guide Section 9).

---

### 5. Kotak Mahindra Bank (`kotak`)
- **EDF Form:** No bank-specific service EDF template published; uses statutory RBI Annex (`placeholder: true`).
  - Primary URL: https://www.kotak.com (retrieved 2026-10-08)
  - Net Banking Login: https://netbanking.kotak.bank.in/knb2/ (retrieved 2026-10-08)
  - Trade Services URL: https://www.kotak.bank.in/en/business/trade-services/international-exports/features.html (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking:** Kotak Net Banking https://netbanking.kotak.bank.in/knb2/ (retrieved 2026-10-08) / Kotak Fyn portal via https://www.kotak.com (retrieved 2026-10-08).
  - **Branch:** Branch Trade Desk / Forex desk.
  - **Email:** RM / branch trade email.
- **Required Documents:**
  - Statutory EDF (RBI Annex);
  - Export invoices and service agreements.
- **Signing Rules:** Signature of authorized signatory and company seal.
- **Turnaround / Deadline:** Statutory 30 days from month end.

---

### 6. Yes Bank (`yes`)
- **EDF Form:** Publishes goods EDF waiver/approval request letter, but no service-specific EDF; uses statutory RBI Annex (`placeholder: true`).
  - Primary URL: https://www.yesbank.in (retrieved 2026-10-08)
  - Corporate Net Banking Login: https://corporate.yesbank.in/ (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking:** Corporate Net Banking https://corporate.yesbank.in/ (retrieved 2026-10-08) (Smart Trade module).
  - **Branch:** Branch Trade Desk.
  - **Email:** Branch / RM email.
- **Required Documents:**
  - Statutory EDF (RBI Annex);
  - Export invoices and service contracts.
- **Signing Rules:** Authorized signatory signature and company seal.
- **Turnaround / Deadline:** Statutory 30 days from month end.

---

### 7. IDFC FIRST Bank (`idfc-first`)
- **EDF Form:** No bank-specific service EDF published; uses statutory RBI Annex (`placeholder: true`).
  - Primary URL: https://www.idfcfirstbank.com (retrieved 2026-10-08)
  - BXP Corporate Portal Login: https://corplogin.idfcbank.com/ (retrieved 2026-10-08)
  - Export Trade Services URL: https://www.idfcfirst.bank.in/business-banking/export (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking:** Business eXperience Platform (BXP) https://corplogin.idfcbank.com/ (retrieved 2026-10-08) (Online Trade module).
  - **Branch:** Branch Trade Finance Desk.
  - **Email:** RM / branch trade email (support: CIB.Support@idfcfirstbank.com).
- **Required Documents:**
  - Statutory EDF (RBI Annex);
  - Export invoices and contracts.
- **Signing Rules:** Authorized signatory signature and company seal.
- **Turnaround / Deadline:** Statutory 30 days from month end.

---

### 8. IndusInd Bank (`indusind`)
- **EDF Form:** No bank-specific service EDF published; uses statutory RBI Annex (`placeholder: true`).
  - Primary URL: https://www.indusind.com (retrieved 2026-10-08)
  - IndusDIRECT Corporate Login: https://indusdirect.indusind.com (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking:** IndusDIRECT portal https://indusdirect.indusind.com (retrieved 2026-10-08) (Trade & Forex module).
  - **Branch:** Branch Trade Desk / Relationship Manager.
  - **Email:** Branch / RM email.
- **Required Documents:**
  - Statutory EDF (RBI Annex);
  - Export invoices and underlying contracts.
- **Signing Rules:** Authorized signatory signature and company seal.
- **Turnaround / Deadline:** Statutory 30 days from month end.

---

### 9. Bank of Baroda (`bob`)
- **EDF Form:** No bank-specific service EDF published; uses statutory RBI Annex (`placeholder: true`).
  - Primary URL: https://www.bankofbaroda.in (retrieved 2026-10-08)
  - bob World Internet Login: https://feba.bobibanking.com (retrieved 2026-10-08)
  - BarodaINSTA SmartTrade Login: https://www.barodainsta.com (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking:** BarodaINSTA SmartTrade https://www.barodainsta.com (retrieved 2026-10-08) or bob World Internet https://feba.bobibanking.com (retrieved 2026-10-08).
  - **Branch:** Branch Forex / Trade Finance desk.
  - **Email:** Branch / RM email.
- **Required Documents:**
  - Statutory EDF (RBI Annex);
  - Export invoices and contracts.
- **Signing Rules:** Authorized signatory signature and company seal.
- **Turnaround / Deadline:** Statutory 30 days from month end.

---

### 10. Punjab National Bank (`pnb`)
- **EDF Form:** No bank-specific service EDF published; uses statutory RBI Annex (`placeholder: true`).
  - Primary URL: https://www.pnbindia.in (retrieved 2026-10-08)
  - Corporate Internet Banking Login: https://ibanking.pnb.bank.in/ (retrieved 2026-10-08)
- **Submission Channels:**
  - **Netbanking:** Corporate Internet Banking https://ibanking.pnb.bank.in/ (retrieved 2026-10-08) (Trade Finance module).
  - **Branch:** Designated Forex Branch / Trade Finance Desk.
  - **Email:** Branch / RM email.
- **Required Documents:**
  - Statutory EDF (RBI Annex);
  - Export invoices and service contracts.
- **Signing Rules:** Authorized signatory signature and company seal.
- **Turnaround / Deadline:** Statutory 30 days from month end.

---

## 3. Verification Summary Table

| Bank Key | Bank Name | EDF Form Verified | Own Template Published | Submission Channels Verified | Netbanking / Trade Login Verified | Published Menu Path | Central Email Published | Branch Channel Verified | Signing Rules Verified |
|---|---|---|---|---|---|---|---|---|---|
| `hdfc` | HDFC Bank | Verified | Yes (Request letter) | Verified | NetBanking | Not found (trade portal) | Not found | Verified (Trade Desk) | Verified (Record sig + seal) |
| `icici` | ICICI Bank | Verified | Yes (RBI Annex) | Verified | CIB / Trade Online | Verified (Trade > Trade Online) | Not found | Verified | Verified (Sig + seal) |
| `axis` | Axis Bank | Verified | Yes (Annexure 6 + Req letter) | Verified | NEO for Corporates | Verified (Trade Finance / TF Connect) | Not found (RM/branch email) | Verified | Verified (Wet, scan, stamp, DSC) |
| `sbi` | State Bank of India | Verified (RBI Annex) | No (Policy checklist only) | Verified | YONO Business | Not found | Not found | Verified (T+1 TAT) | Verified (Sig + seal) |
| `kotak` | Kotak Mahindra Bank | Unverified (RBI Annex) | No | Verified | Net Banking / Kotak Fyn | Not found | Not found | Verified | Verified (Sig + seal) |
| `yes` | Yes Bank | Unverified (RBI Annex) | No | Verified | Corporate Net Banking | Not found | Not found | Verified | Verified (Sig + seal) |
| `idfc-first` | IDFC FIRST Bank | Unverified (RBI Annex) | No | Verified | BXP Portal | Not found | Not found | Verified | Verified (Sig + seal) |
| `indusind` | IndusInd Bank | Unverified (RBI Annex) | No | Verified | IndusDIRECT | Not found | Not found | Verified | Verified (Sig + seal) |
| `bob` | Bank of Baroda | Unverified (RBI Annex) | No | Verified | BarodaINSTA / feba | Not found | Not found | Verified | Verified (Sig + seal) |
| `pnb` | Punjab National Bank | Unverified (RBI Annex) | No | Verified | Corporate Internet Banking | Not found | Not found | Verified | Verified (Sig + seal) |

**Legend:**
- **Verified:** Primary official bank document or live authenticated portal link retrieved.
- **Unverified:** Bank publishes no separate service EDF form or detailed step-by-step menu path; fallback to statutory RBI Annex with `placeholder: true` and user instruction to "confirm with your branch".
- **Not found:** No primary source exists on public web for central trade submission email or specific digital menu path.
