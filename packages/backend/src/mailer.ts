import { Resend } from "resend";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

export function createResendMailer(opts: { apiKey: string; from: string }): Mailer {
  const client = new Resend(opts.apiKey);
  return {
    async send(msg) {
      const { error } = await client.emails.send({
        from: opts.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      });
      if (error) throw new Error(`Resend failed: ${error.message}`);
    },
  };
}

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
