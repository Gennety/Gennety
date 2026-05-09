import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "Gennety <legal@gennety.com>";
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── Shared email layout ── */

function emailLayout(body: string, settingsUrl?: string): string {
  const manageUrl = settingsUrl ?? `${BASE_URL}/settings`;
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
      ${body}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #888; margin: 0;">
          Gennety — AI-powered professional networking
        </p>
        <p style="font-size: 11px; color: #aaa; margin: 4px 0 0 0;">
          <a href="${manageUrl}" style="color: #aaa; text-decoration: underline;">Account settings</a>
        </p>
      </div>
    </div>
  `;
}

function ctaButton(text: string, url: string): string {
  return `<a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 24px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">${escapeHtml(text)}</a>`;
}

/* ── Send helper ── */

type SendResult = { sent: boolean; reason?: string; emailId?: string };

async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  if (!resend) {
    console.log(`[notification] Resend not configured — skipping email to ${to}`);
    return { sent: false, reason: "RESEND_API_KEY not set" };
  }

  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });

    if (error) {
      console.error(`[notification] Failed to send to ${to}:`, error);
      return { sent: false, reason: error.message };
    }

    return { sent: true, emailId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notification] Error sending to ${to}:`, message);
    return { sent: false, reason: message };
  }
}

/* ── 1. Password reset ── */

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  return sendEmail(
    email,
    "Reset your password — Gennety",
    emailLayout(`
      <h2 style="font-size: 20px; color: #111; margin-bottom: 8px;">Password reset request</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
        We received a request to reset the password for your Gennety account.
        Click the button below to choose a new password.
      </p>
      ${ctaButton("Reset password", resetUrl)}
      <p style="margin-top: 24px; color: #555; line-height: 1.6;">
        This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>
    `)
  );
}

/* ── 2. Password changed ── */

export async function sendPasswordChangedEmail(email: string) {
  return sendEmail(
    email,
    "Your password has been changed — Gennety",
    emailLayout(`
      <h2 style="font-size: 20px; color: #111; margin-bottom: 8px;">Password changed</h2>
      <p style="color: #555; line-height: 1.6;">
        Your Gennety account password was successfully changed.
        If you did not make this change, please reset your password immediately or contact support.
      </p>
    `)
  );
}

/* ── 3. Community invite ── */

export async function sendCommunityInviteEmail(
  email: string,
  communityName: string,
  inviterName: string | null,
  inviteUrl: string
) {
  const inviter = inviterName ? escapeHtml(inviterName) : "A Gennety member";

  return sendEmail(
    email,
    `Invitation to join ${communityName} — Gennety`,
    emailLayout(`
      <h2 style="font-size: 20px; color: #111; margin-bottom: 8px;">Community invitation</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 16px;">
        ${inviter} invited you to join <strong>${escapeHtml(communityName)}</strong> on Gennety.
      </p>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
        This invitation is personal and expires in 7 days.
      </p>
      ${ctaButton("Accept invitation", inviteUrl)}
    `)
  );
}
