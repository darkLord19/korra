/** What a file in the pack is, in a line, for the "What's inside" lists. */
export function fileDescription(name: string): string {
  if (name.startsWith("EDF-") && name.endsWith(".pdf")) return "Official EDF request letter / Annexure (PDF) to submit to your bank.";
  if (name.startsWith("EDF-") && name.endsWith(".xlsx")) return "Structured spreadsheet with export invoice breakdown.";
  if (name.startsWith("supporting-") && name.endsWith(".zip")) return "Zip archive containing all export invoices and credit advices.";
  if (name.startsWith("HOW-TO-SUBMIT")) return "Offline guide with checklist and bank-specific instructions.";
  if (name.startsWith("DECLARATION-")) return "Statutory declaration form.";
  return "Document included in this submission pack.";
}
