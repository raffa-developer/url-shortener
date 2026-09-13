import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development default: logs the message (including any action link) instead of
 * sending it, so the flows work with zero external setup.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly logger: FastifyBaseLogger) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.info(
      { to: message.to, subject: message.subject, body: message.text },
      "email captured by console mailer",
    );
  }
}

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend request failed (${response.status}): ${body}`);
    }
  }
}

export function createMailer(config: AppConfig, logger: FastifyBaseLogger): Mailer {
  return config.resendApiKey
    ? new ResendMailer(config.resendApiKey, config.mailFrom)
    : new ConsoleMailer(logger);
}
