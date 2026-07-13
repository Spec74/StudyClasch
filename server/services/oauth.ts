import { OAuth2Client } from 'google-auth-library';
import { UserModel } from '../models/User.js';
import { sendRegistrationEmail } from './email.js';

function getGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_OAUTH_CALLBACK_URL ?? 'http://localhost:3000/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  return {
    client: new OAuth2Client(clientId, clientSecret, callbackUrl),
    clientId,
  };
}

export async function verifyGoogleToken(idToken: string) {
  const { client, clientId } = getGoogleOAuthClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId, // Verifica que el token fue generado para tu app
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.name || !payload.sub) {
    throw new Error('Google token validation failed.');
  }

  return {
    email: payload.email,
    name: payload.name,
    googleId: payload.sub,
  };
}

export async function findOrCreateGoogleUser(googleProfile: { email: string; name: string; googleId: string }) {
  const normalizedEmail = googleProfile.email.toLowerCase();
  let user = await UserModel.findOne({ email: normalizedEmail });

  if (user) {
    // Si el usuario ya existe pero se registró con email/contraseña, le vinculamos la cuenta de Google
    if (user.authProvider !== 'google') {
      user.authProvider = 'google';
      user.googleId = googleProfile.googleId;
      await user.save();
    }
    return user;
  }

  // ¡NUEVO! Generamos un sufijo aleatorio para evitar que 2 "Juan" rompan la BD por Username duplicado
  const baseName = googleProfile.name.replace(/\s+/g, '_').slice(0, 15);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4 dígitos aleatorios
  const uniqueUsername = `${baseName}_${randomSuffix}`;

  user = await UserModel.create({
    username: uniqueUsername,
    email: normalizedEmail,
    institution: 'Google Sign-in',
    bio: 'Usuario autenticado con Google.',
    authProvider: 'google',
    googleId: googleProfile.googleId,
    level: 1,
    xp: 0,
    maxXp: 1000,
    coins: 100,
    credits: 5,
    avatarId: 'cyber_scholar',
    isPremium: false,
  });

  await sendRegistrationEmail(normalizedEmail, user.username);
  return user;
}