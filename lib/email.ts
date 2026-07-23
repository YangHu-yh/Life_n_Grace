// The sender address and provider are pure configuration — swapping the temp
// Gmail for the formal address later is an env/secret change, zero code (see
// DEPLOYMENT.md "Changing the sender email").
// `||` not `??`: on Lambda unset keys arrive as empty strings, which must
// still fall back to the default.
const FROM = process.env.EMAIL_FROM || "Life-n-Grace <noreply@lifengrace.com>";

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

// Email delivery is optional until a provider is configured. Callers use
// isEmailConfigured() to decide whether flows that REQUIRE delivery (email
// verification) should be enforced or softened.
export function isEmailConfigured(): boolean {
  return (
    Boolean(process.env.RESEND_API_KEY) ||
    process.env.EMAIL_PROVIDER === "ses" ||
    isSmtpConfigured()
  );
}

async function sendEmail(to: string, subject: string, html: string) {
  if (process.env.EMAIL_PROVIDER === "ses") {
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
    const ses = new SESClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    await ses.send(
      new SendEmailCommand({
        Source: FROM,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: html } }
        }
      })
    );
    return;
  }

  // SMTP: the temp-testing path (e.g. a Gmail address with an app password,
  // host smtp.gmail.com port 587) and a general escape hatch for any
  // provider Resend/SES don't cover.
  if (isSmtpConfigured()) {
    const nodemailer = (await import("nodemailer")).default;
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // implicit TLS on 465; STARTTLS otherwise
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    await transport.sendMail({ from: FROM, to, subject, html });
    return;
  }

  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: FROM, to, subject, html });
    return;
  }

  // No provider configured — log the event (never the address: GDPR
  // Art. 5(1)(f)) so the flow is observable in dev and demo tiers.
  console.warn(`[email] no provider configured — skipped sending "${subject}"`);
}

export async function sendVerificationEmail(to: string, verifyLink: string) {
  await sendEmail(
    to,
    "Verify your Life-n-Grace email",
    `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2>Verify your email</h2>
      <p>Click the button below to verify your Life-n-Grace account. This link expires in 24 hours.</p>
      <a href="${verifyLink}" style="display:inline-block;padding:12px 24px;background:#2f6bff;color:#fff;border-radius:6px;text-decoration:none">Verify email</a>
      <p style="margin-top:24px;color:#6b7280;font-size:14px">If you didn't sign up, you can safely ignore this email.</p>
    </div>
    `
  );
}

export async function sendReminderEmail(to: string) {
  const prayersLink = `${(process.env.APP_BASE_URL ?? "").replace(/\/$/, "")}/prayers`;
  await sendEmail(
    to,
    "Your daily prayer reminder",
    `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2>Time to pray</h2>
      <p>This is your daily reminder to spend a moment with God. Your prayer wall is waiting for you.</p>
      <a href="${prayersLink}" style="display:inline-block;padding:12px 24px;background:#2f6bff;color:#fff;border-radius:6px;text-decoration:none">Open your prayer wall</a>
      <p style="margin-top:24px;color:#6b7280;font-size:14px">You can change or delete this reminder any time from your profile.</p>
    </div>
    `
  );
}

export async function sendPasswordResetEmail(to: string, resetLink: string) {
  await sendEmail(
    to,
    "Reset your Life-n-Grace password",
    `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2>Reset your password</h2>
      <p>Click the button below to choose a new password. This link expires in 1 hour.</p>
      <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#2f6bff;color:#fff;border-radius:6px;text-decoration:none">Reset password</a>
      <p style="margin-top:24px;color:#6b7280;font-size:14px">If you didn't request this, you can safely ignore this email.</p>
    </div>
    `
  );
}
