import nodemailer from "nodemailer";
import { config } from "./config.js";

function getTransporter() {
  if (!config.smtp.host) return null;
  const transport = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465
  };
  if (config.smtp.user) {
    transport.auth = {
      user: config.smtp.user,
      pass: config.smtp.pass
    };
  }
  return nodemailer.createTransport(transport);
}

function getAppUrl() {
  return config.appUrl || `http://localhost:${config.port}`;
}

export async function sendInvitationEmail(user, token) {
  const link = `${getAppUrl()}?token=${token}`;
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[MAILER MOCK] Invitation envoyee a ${user.email}`);
    console.log(`[MAILER MOCK] Lien: ${link}`);
    return { mode: "mock", link };
  }

  const mailOptions = {
    from: `"OHADA FinanceOS" <${config.smtp.from}>`,
    to: user.email,
    subject: "Invitation a rejoindre OHADA FinanceOS",
    text: `Bonjour ${user.name || user.email},

Vous avez ete invite a rejoindre OHADA FinanceOS.

Veuillez cliquer sur le lien suivant pour configurer votre compte :
${link}

Ce lien expirera dans 7 jours.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Invitation a OHADA FinanceOS</h2>
        <p>Bonjour ${user.name || user.email},</p>
        <p>Vous avez ete invite a rejoindre OHADA FinanceOS.</p>
        <p>
          <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #6366f1; color: #fff; text-decoration: none; border-radius: 5px;">Accepter l'invitation</a>
        </p>
        <p>Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :<br/>
        <a href="${link}">${link}</a></p>
        <p><em>Ce lien expirera dans 7 jours.</em></p>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  return { mode: "smtp", messageId: info.messageId, link };
}

export async function sendPasswordResetEmail(user, token) {
  const link = `${getAppUrl()}?token=${token}`;
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[MAILER MOCK] Reinitialisation envoyee a ${user.email}`);
    console.log(`[MAILER MOCK] Lien: ${link}`);
    return { mode: "mock", link };
  }

  const mailOptions = {
    from: `"OHADA FinanceOS" <${config.smtp.from}>`,
    to: user.email,
    subject: "Reinitialisation de votre mot de passe",
    text: `Bonjour,

Vous avez demande une reinitialisation de mot de passe.

Veuillez cliquer sur le lien suivant :
${link}

Ce lien expirera dans 1 heure.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Reinitialisation de mot de passe</h2>
        <p>Bonjour,</p>
        <p>Vous avez demande une reinitialisation de votre mot de passe sur OHADA FinanceOS.</p>
        <p>
          <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #6366f1; color: #fff; text-decoration: none; border-radius: 5px;">Reinitialiser mon mot de passe</a>
        </p>
        <p>Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :<br/>
        <a href="${link}">${link}</a></p>
        <p><em>Ce lien expirera dans 1 heure. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</em></p>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  return { mode: "smtp", messageId: info.messageId, link };
}

export async function verifyMailer() {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, mode: "mock", error: "SMTP_HOST n'est pas configure." };
  }
  await transporter.verify();
  return { ok: true, mode: "smtp", host: config.smtp.host, port: config.smtp.port };
}
