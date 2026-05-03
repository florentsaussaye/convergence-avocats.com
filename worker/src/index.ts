interface Env {
  RESEND_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RECIPIENT_EMAIL: string;
  FROM_EMAIL: string;
}

interface FormPayload {
  nom?: string;
  societe?: string;
  email?: string;
  telephone?: string;
  domaine?: string;
  message?: string;
  hp?: string;
}

const NAVY = "#0B1731";
const GOLD = "#C6973F";
const NAVY_DEEP = "#060D1E";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGIN.split(",").map((s) => s.trim());
    const corsOrigin = allowed.includes(origin) ? origin : allowed[0];

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsOrigin);
    }

    if (!allowed.includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, corsOrigin);
    }

    let data: FormPayload;
    try {
      data = await request.json<FormPayload>();
    } catch {
      return json({ error: "Invalid JSON" }, 400, corsOrigin);
    }

    if (data.hp) {
      return json({ ok: true }, 200, corsOrigin);
    }

    const nom = (data.nom ?? "").trim();
    const email = (data.email ?? "").trim();
    const message = (data.message ?? "").trim();
    const societe = (data.societe ?? "").trim();
    const telephone = (data.telephone ?? "").trim();
    const domaine = (data.domaine ?? "").trim();

    if (!nom || !email || !message) {
      return json({ error: "Champs obligatoires manquants (nom, email, message)" }, 400, corsOrigin);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Email invalide" }, 400, corsOrigin);
    }
    if (nom.length > 120 || email.length > 200 || societe.length > 200 || telephone.length > 40 || domaine.length > 120 || message.length > 5000) {
      return json({ error: "Champ trop long" }, 400, corsOrigin);
    }

    const subject = `Nouvelle demande de contact${domaine ? " — " + domaine : ""}`;

    try {
      await sendResend(env.RESEND_API_KEY, {
        from: env.FROM_EMAIL,
        to: [env.RECIPIENT_EMAIL],
        reply_to: email,
        subject,
        html: notificationEmail({ nom, societe, email, telephone, domaine, message }),
      });

      await sendResend(env.RESEND_API_KEY, {
        from: env.FROM_EMAIL,
        to: [email],
        reply_to: env.RECIPIENT_EMAIL,
        subject: "Votre message a bien été reçu — Convergence Avocats",
        html: acknowledgementEmail({ nom, message }),
      });

      return json({ ok: true }, 200, corsOrigin);
    } catch (err) {
      console.error("Send error:", err);
      return json({ error: "Erreur lors de l'envoi du message" }, 500, corsOrigin);
    }
  },
};

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

async function sendResend(apiKey: string, payload: Record<string, unknown>): Promise<void> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    throw new Error(`Resend ${r.status}: ${await r.text()}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br>");
}

function notificationEmail(d: { nom: string; societe: string; email: string; telephone: string; domaine: string; message: string }): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E5E5E5;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8A909E;width:140px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #E5E5E5;font-size:14px;color:#1A1A2E;vertical-align:top;">${escapeHtml(value)}</td></tr>`
      : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F7F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E5E5E5;">
      <tr><td style="background:${NAVY};padding:28px 32px;border-bottom:3px solid ${GOLD};">
        <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;letter-spacing:2px;color:#FFFFFF;">CONVERGENCE AVOCATS</div>
        <div style="font-size:10px;letter-spacing:3px;color:${GOLD};margin-top:4px;text-transform:uppercase;">Nouvelle demande de contact</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:600;color:${NAVY};margin:0 0 24px;">Nouvelle demande</h1>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          ${row("Nom", d.nom)}
          ${row("Société", d.societe)}
          ${row("Email", d.email)}
          ${row("Téléphone", d.telephone)}
          ${row("Domaine", d.domaine)}
        </table>
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};margin-bottom:10px;">Message</div>
        <div style="font-size:14px;color:#1A1A2E;line-height:1.7;background:#F7F5F0;padding:18px 20px;border-left:3px solid ${GOLD};">${nl2br(d.message)}</div>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid #E5E5E5;font-size:12px;color:#8A909E;line-height:1.6;">
          Pour répondre à ce message, utilisez la fonction « Répondre » de votre messagerie : la réponse partira directement vers <strong style="color:#1A1A2E;">${escapeHtml(d.email)}</strong>.
        </div>
      </td></tr>
      <tr><td style="background:${NAVY_DEEP};padding:18px 32px;font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:1.5px;text-transform:uppercase;">
        Formulaire de contact · convergence-avocats.com
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function acknowledgementEmail(d: { nom: string; message: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F7F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E5E5E5;">
      <tr><td style="background:${NAVY};padding:32px;border-bottom:3px solid ${GOLD};text-align:center;">
        <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:3px;color:#FFFFFF;">CONVERGENCE AVOCATS</div>
        <div style="font-size:10px;letter-spacing:4px;color:${GOLD};margin-top:6px;text-transform:uppercase;">Paris · Marseille · Nice</div>
      </td></tr>
      <tr><td style="padding:40px 32px;">
        <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:600;color:${NAVY};margin:0 0 24px;">Votre message a bien été reçu</h1>
        <p style="font-size:15px;color:#1A1A2E;line-height:1.75;margin:0 0 18px;">Bonjour ${escapeHtml(d.nom)},</p>
        <p style="font-size:14px;color:#5E6473;line-height:1.85;margin:0 0 16px;">Nous accusons réception de votre demande adressée à Convergence Avocats. Nos équipes en prennent connaissance et vous répondront dans les meilleurs délais — sans délai superflu lorsque la situation l'exige.</p>
        <p style="font-size:14px;color:#5E6473;line-height:1.85;margin:0 0 16px;">L'ensemble des informations que vous nous avez transmises est strictement confidentiel et soumis au secret professionnel de l'avocat.</p>
        <div style="margin:28px 0;padding:18px 20px;background:#F7F5F0;border-left:3px solid ${GOLD};">
          <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};margin-bottom:8px;">Votre message</div>
          <div style="font-size:13px;color:#5E6473;line-height:1.7;font-style:italic;">${nl2br(d.message)}</div>
        </div>
        <p style="font-size:14px;color:#5E6473;line-height:1.85;margin:24px 0 0;">Bien à vous,<br><strong style="color:${NAVY};">Convergence Avocats</strong></p>
      </td></tr>
      <tr><td style="background:${NAVY_DEEP};padding:24px 32px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,0.4);line-height:1.7;">
          <a href="https://www.convergence-avocats.com" style="color:${GOLD};text-decoration:none;">www.convergence-avocats.com</a><br>
          <a href="mailto:contact@convergence-avocats.com" style="color:rgba(255,255,255,0.5);text-decoration:none;">contact@convergence-avocats.com</a> · 01.44.29.34.00
        </div>
        <div style="margin-top:14px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.25);">
          Teitgen &amp; Viottolo · Marigny Avocats
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
