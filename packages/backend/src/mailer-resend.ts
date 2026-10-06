import { Resend } from "resend";
import type { Mailer } from "./mailer-types";

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
