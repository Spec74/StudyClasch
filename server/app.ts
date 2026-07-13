import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { authRouter } from './routes/auth';
import { googleAuthRouter } from './routes/googleAuth';
import { roomsRouter } from './routes/rooms';
import { quizzesRouter } from './routes/quizzes';
import { paymentRouter } from './routes/payment';

export const app = express();

// CORS Blindado para la API REST (Acepta peticiones desde Vercel)
app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'StudyClash API' });
});

app.use('/api/auth', authRouter);
app.use('/api/auth/google', googleAuthRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/quizzes', quizzesRouter);
app.use('/api/payments', paymentRouter);

// Manejador de errores limpio (sin asteriscos)
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  res.status(500).json({ error: message });
});