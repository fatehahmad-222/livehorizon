import nodemailer from "nodemailer";

interface NotificationInput {
  name?: string;
  email: string;
  phone?: string;
  person?: string;
  message?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function personLabel(person?: string): string {
  switch (person) {
    case "myself":
      return "Myself";
    case "family-member":
      return "A family member";
    case "client-patient":
      return "A client / patient";
    default:
      return person || "Not specified";
  }
}

export async function sendNotificationEmail(
  data: NotificationInput,
): Promise<void> {
  console.log("[Notification] Starting email notification...");

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const toEmail = process.env.NOTIFICATION_EMAIL;

  console.log("[Notification] GMAIL_USER:", gmailUser ? `${gmailUser.substring(0, 3)}***` : "MISSING");
  console.log("[Notification] GMAIL_APP_PASSWORD:", gmailPass ? "SET" : "MISSING");
  console.log("[Notification] NOTIFICATION_EMAIL:", toEmail || "MISSING");

  if (!gmailUser || !gmailPass || !toEmail) {
    throw new Error(
      `Missing env vars - GMAIL_USER: ${gmailUser ? "OK" : "MISSING"}, GMAIL_APP_PASSWORD: ${gmailPass ? "OK" : "MISSING"}, NOTIFICATION_EMAIL: ${toEmail ? "OK" : "MISSING"}`,
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  const displayName = data.name?.trim() || "Unknown";
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "full",
    timeStyle: "short",
  });

  const htmlBody = `
    <div style="font-family: 'Jost', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #3A3028;">
      <div style="background: #2C3E3F; padding: 24px 32px;">
        <h1 style="margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 400; color: #FDFAF5; letter-spacing: 0.08em; text-transform: uppercase;">
          Horizon <span style="color: #9E7B5A;">House</span>
        </h1>
        <p style="margin: 8px 0 0; font-size: 12px; color: rgba(253,250,245,0.5); letter-spacing: 0.12em; text-transform: uppercase;">
          New Contact Form Submission
        </p>
      </div>

      <div style="background: #FDFAF5; padding: 32px; border: 1px solid rgba(184,205,212,0.3); border-top: none;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 12px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; color: #7A6E64; width: 140px; vertical-align: top;">
              Name
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 15px; color: #3A3028;">
              ${displayName}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 12px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; color: #7A6E64; vertical-align: top;">
              Email
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 15px;">
              <a href="mailto:${data.email}" style="color: #9E7B5A; text-decoration: none;">${data.email}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 12px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; color: #7A6E64; vertical-align: top;">
              Phone
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 15px; color: #3A3028;">
              ${data.phone?.trim() || "Not provided"}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 12px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; color: #7A6E64; vertical-align: top;">
              Who is this for?
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 15px; color: #3A3028;">
              ${personLabel(data.person)}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 12px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; color: #7A6E64; vertical-align: top;">
              Message
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #D9E6EA; font-size: 15px; color: #3A3028; line-height: 1.6;">
              ${data.message?.trim() || "No message provided"}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; font-size: 12px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; color: #7A6E64; vertical-align: top;">
              Submitted
            </td>
            <td style="padding: 12px 0; font-size: 15px; color: #3A3028;">
              ${timestamp}
            </td>
          </tr>
        </table>
      </div>

      <div style="padding: 16px 32px; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #7A6E64; letter-spacing: 0.1em;">
          This notification was sent from the Horizon House contact form.
        </p>
      </div>
    </div>
  `;

  console.log("[Notification] Sending email to:", toEmail);

  const info = await transporter.sendMail({
    from: `"Horizon House" <${gmailUser}>`,
    to: toEmail,
    subject: `New Contact Form Submission from ${displayName}`,
    html: htmlBody,
  });

  console.log("[Notification] Email sent successfully! Message ID:", info.messageId);
}
