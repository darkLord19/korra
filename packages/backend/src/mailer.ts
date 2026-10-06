import type { MailMessage, Mailer } from "./mailer-types";

export type { MailMessage, Mailer } from "./mailer-types";

/** Prints mail to the console (local dev when RESEND_API_KEY is unset). */
export function createConsoleMailer(log: (line: string) => void = console.log): Mailer {
  return {
    async send(msg) {
      log(`[mail] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}`);
    },
  };
}

export interface MemoryMailer extends Mailer {
  readonly sent: MailMessage[];
  clear(): void;
}

/** Test double: records every message. */
export function createMemoryMailer(): MemoryMailer {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
    },
    clear() {
      sent.length = 0;
    },
  };
}
