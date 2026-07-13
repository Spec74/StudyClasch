import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const defaultFrom = process.env.DEFAULT_FROM_EMAIL ?? 'no-reply@studyclash.local';

const tlsOptions: Record<string, unknown> = {
  rejectUnauthorized: false,
};

if (host?.endsWith('brevo.com')) {
  // Brevo SMTP relays may present a Sendinblue certificate name.
  tlsOptions.servername = 'smtp-relay.sendinblue.com';
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: user && pass ? { user, pass } : undefined,
  tls: tlsOptions,
});

export async function sendRegistrationEmail(to: string, username: string) {
  if (!host || !user || !pass) {
    console.warn('SMTP credentials are not configured. Skipping registration email.');
    return;
  }

  await transporter.sendMail({
    from: defaultFrom,
    to,
    subject: '¡Bienvenido a StudyClash!',
    text: `Hola ${username},\n\nGracias por registrarte en StudyClash. Ya puedes subir PDFs, competir y ganar monedas.\n\n¡Éxitos!\nEl equipo de StudyClash`,
    html: `
      <div style="font-family: sans-serif; color: #1f2937;">
        <h1>¡Bienvenido a StudyClash, ${username}!</h1>
        <p>Gracias por registrarte. Ya puedes subir tus apuntes, generar cuestionarios automáticos y comenzar a competir con amigos.</p>
        <p>Si necesitas ayuda, responde a este correo.</p>
        <p>¡Nos vemos en la arena del conocimiento!</p>
        <p><strong>El equipo de StudyClash</strong></p>
      </div>
    `,
  });
}

export async function sendPremiumActivationEmail(to: string, username: string) {
  if (!host || !user || !pass) {
    console.warn('SMTP credentials are not configured. Skipping premium activation email.');
    return;
  }

  await transporter.sendMail({
    from: defaultFrom,
    to,
    subject: 'Tu plan Premium de StudyClash está activo',
    text: `Hola ${username},\n\nTu cuenta de StudyClash ahora tiene acceso premium. Disfruta contenidos exclusivos, más skins y mejores recompensas.\n\n¡A jugar!\nEl equipo de StudyClash`,
    html: `
      <div style="font-family: sans-serif; color: #1f2937;">
        <h1>¡Tu Premium está activo, ${username}!</h1>
        <p>Gracias por confiar en StudyClash. Ya puedes desbloquear contenido exclusivo y obtener beneficios adicionales en cada partida.</p>
        <p>Disfruta y sigue aprendiendo.</p>
        <p><strong>El equipo de StudyClash</strong></p>
      </div>
    `,
  });
}
