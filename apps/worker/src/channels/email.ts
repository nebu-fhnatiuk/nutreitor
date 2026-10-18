/** Canal de email. En dev imprime por consola; en prod, Amazon SES (ADR 0023). */
export interface EmailMessage {
  to: string;
  /** Nombre visible del remitente (el consultorio). */
  fromName: string;
  subject: string;
  text: string;
}

export interface EmailChannel {
  send(msg: EmailMessage): Promise<void>;
}

export class ConsoleEmail implements EmailChannel {
  async send(msg: EmailMessage): Promise<void> {
    console.log(`[mail] → ${msg.to} · ${msg.fromName} · ${msg.subject}\n${msg.text}\n`);
  }
}

export class SesEmail implements EmailChannel {
  private client: Promise<import("@aws-sdk/client-sesv2").SESv2Client>;

  constructor(
    region: string,
    private readonly from: string,
  ) {
    // Import perezoso: el SDK sólo se carga si SES está activo.
    this.client = import("@aws-sdk/client-sesv2").then((m) => new m.SESv2Client({ region }));
  }

  async send(msg: EmailMessage): Promise<void> {
    const { SendEmailCommand } = await import("@aws-sdk/client-sesv2");
    const name = msg.fromName.replace(/["<>\r\n]/g, "").trim();
    await (await this.client).send(
      new SendEmailCommand({
        FromEmailAddress: name ? `"${name}" <${this.from}>` : this.from,
        Destination: { ToAddresses: [msg.to] },
        Content: {
          Simple: {
            Subject: { Data: msg.subject, Charset: "UTF-8" },
            Body: { Text: { Data: msg.text, Charset: "UTF-8" } },
          },
        },
      }),
    );
  }
}
