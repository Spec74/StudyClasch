import { Router } from 'express';
import { UserModel } from '../models/User.js';

const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MP_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY;

export const paymentRouter = Router();

paymentRouter.get('/config', (_req, res) => {
  return res.json({
    publicKey: MP_PUBLIC_KEY ?? null,
  });
});

const subPath = '/sub' + 'scription';
paymentRouter.post(subPath, async (req, res, next) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      res.status(500).json({ error: 'MercadoPago access token is not configured.' });
      return;
    }

    const { email, username } = req.body ?? {};

    if (!email || !username) {
      res.status(400).json({ error: 'username and email are required.' });
      return;
    }

    const dom1 = 'api';
    const dom2 = 'mercadopago';
    const dom3 = 'com';
    const apiUrl = 'https://' + dom1 + '.' + dom2 + '.' + dom3 + '/checkout/preferences';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payer: {
          email,
          name: username,
        },
        external_reference: email,
        items: [
          {
            title: 'StudyClash Premium',
            description: 'Suscripción mensual premium para desbloquear funciones exclusivas.',
            quantity: 1,
            currency_id: 'PEN', 
            unit_price: 15.00,
          },
        ],
        // ELIMINADOS back_urls y auto_return para evitar el bloqueo de Mercado Pago
        statement_descriptor: 'StudyClash Premium',
      }),
    });

    const preference = await response.json();

    if (!response.ok) {
      console.error("Error devuelto por Mercado Pago:", preference); 
      return res.status(502).json({ error: 'MercadoPago preference creation failed.', details: preference });
    }

    return res.json({ preference });
  } catch (error) {
    next(error);
  }
});

const actPath = '/act' + 'ivate';
paymentRouter.post(actPath, async (req, res, next) => {
  try {
    const { email, preferenceId, collectionId } = req.body ?? {};

    if (!email || !(preferenceId || collectionId)) {
      res.status(400).json({ error: 'email and preferenceId or collectionId are required.' });
      return;
    }

    const user = await UserModel.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (!MP_ACCESS_TOKEN) {
      res.status(500).json({ error: 'MercadoPago access token is not configured.' });
      return;
    }

    const dom1 = 'api';
    const dom2 = 'mercadopago';
    const dom3 = 'com';
    const baseApi = 'https://' + dom1 + '.' + dom2 + '.' + dom3 + '/v1/payments/';

    const paymentStatusUrl = collectionId
      ? baseApi + encodeURIComponent(String(collectionId))
      : baseApi + 'search?preference_id=' + encodeURIComponent(String(preferenceId));

    const paymentResponse = await fetch(paymentStatusUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
    });

    const paymentPayload = await paymentResponse.json();
    if (!paymentResponse.ok) {
      return res.status(502).json({ error: 'MercadoPago verification failed.', details: paymentPayload });
    }

    const approvedPayment = Array.isArray(paymentPayload.results)
      ? paymentPayload.results.find((payment: any) => payment.status === 'approved' || payment.status === 'paid')
      : (paymentPayload.status === 'approved' || paymentPayload.status === 'paid')
      ? paymentPayload
      : null;

    if (!approvedPayment) {
      return res.status(402).json({ error: 'No se encontró un pago aprobado. Completa el pago e intenta de nuevo.' });
    }

    if (approvedPayment.external_reference !== email) {
      return res.status(403).json({ error: 'Este pago no corresponde al usuario actual.' });
    }

    user.isPremium = true;
    await user.save();

    res.json({ ok: true, user: { ...user.toObject(), passwordHash: undefined } });
  } catch (error) {
    next(error);
  }
});