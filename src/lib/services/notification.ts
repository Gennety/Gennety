import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

interface MatchNotification {
  ownerEmail: string;
  ownerName: string | null;
  otherPersonName: string | null;
  framing: string;
  matchId: string;
  ownerId: string;
}

export async function sendMatchProposalEmail(notification: MatchNotification) {
  if (!resend) {
    console.log(
      `[notification] Resend not configured — skipping email to ${notification.ownerEmail}`
    );
    console.log(`[notification] Framing: ${notification.framing}`);
    return { sent: false, reason: "RESEND_API_KEY not set" };
  }

  const notifyUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/notify?ownerId=${notification.ownerId}`;

  try {
    const { data, error } = await resend.emails.send({
      from: "Gennety <notifications@gennety.com>",
      to: notification.ownerEmail,
      subject: `Your agent found someone: ${notification.otherPersonName ?? "a new connection"}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="font-size: 20px; color: #111; margin-bottom: 24px;">
            New introduction proposal
          </h2>
          <div style="background: #f7f7f7; border-left: 3px solid #111; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0; color: #333; line-height: 1.6;">
              ${notification.framing}
            </p>
          </div>
          <a href="${notifyUrl}" style="display: inline-block; padding: 12px 24px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Review proposal
          </a>
          <p style="margin-top: 32px; font-size: 12px; color: #888;">
            Sent by your agent via Gennety
          </p>
        </div>
      `,
    });

    if (error) {
      console.error(`[notification] Failed to send to ${notification.ownerEmail}:`, error);
      return { sent: false, reason: error.message };
    }

    return { sent: true, emailId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notification] Error sending to ${notification.ownerEmail}:`, message);
    return { sent: false, reason: message };
  }
}
