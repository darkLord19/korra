export interface FormState {
  ok?: boolean;
  error?: string;
  /** Field name -> message, parsed from "field: message; field: message". */
  fieldErrors?: Record<string, string>;
  /** Submitted values, echoed back on error so the form does not lose what the user typed. */
  values?: Record<string, string>;
}
