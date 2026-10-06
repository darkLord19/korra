/** Submitted string values, echoed back on error so a form keeps what the user typed. */
export const formValues = (d: FormData): Record<string, string> =>
  Object.fromEntries([...d.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
