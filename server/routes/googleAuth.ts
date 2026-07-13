import { Router } from 'express';
// Nota: en tu texto dijiste que el otro archivo estaba en routes/oauth.ts, pero 
// lo importas desde services/oauth.js. Ajusta la ruta si es necesario.
import { verifyGoogleToken, findOrCreateGoogleUser } from '../services/oauth.js';
// import jwt from 'jsonwebtoken'; // <-- Probablemente necesites esto

export const googleAuthRouter = Router();

googleAuthRouter.post('/token', async (req, res, next) => {
  try {
    const { idToken } = req.body ?? {};
    if (!idToken) {
      res.status(400).json({ error: 'idToken is required.' });
      return;
    }

    const profile = await verifyGoogleToken(String(idToken));
    const user = await findOrCreateGoogleUser(profile);

    // ¡IMPORTANTE! Aquí debes generar tu propio Token para mantener la sesión
    // Ejemplo si usas JWT en tu app:
    // const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      // token, // <-- No olvides enviar el token al frontend si usas JWT
      user: {
        username: user.username,
        email: user.email,
        institution: user.institution,
        bio: user.bio,
        level: user.level,
        xp: user.xp,
        maxXp: user.maxXp,
        coins: user.coins,
        credits: user.credits ?? 0,
        avatarId: user.avatarId,
        isPremium: user.isPremium,
      },
    });
  } catch (error) {
    next(error);
  }
});