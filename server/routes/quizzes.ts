import { Router } from 'express';
import { QuizModel } from '../models/Quiz.js';
import { UserModel } from '../models/User.js';
import { isDatabaseConnected } from '../db.js';
import { generateQuestionsFromPdf } from '../services/gemini.js';
import type { GenerateQuizRequestBody } from '../types.js';
import {
  findQuizSnapshotById,
  listQuizSnapshots,
  saveQuizSnapshot
} from '../storage/quizStore.js';

export const quizzesRouter = Router();

quizzesRouter.get('/', async (_req, res, next) => {
  try {
    const quizzes = isDatabaseConnected()
      ? await QuizModel.find().sort({ createdAt: -1 }).limit(20).lean()
      : listQuizSnapshots();

    res.json({ quizzes });
  } catch (error) {
    next(error);
  }
});

quizzesRouter.get('/:id', async (req, res, next) => {
  try {
    const quiz = isDatabaseConnected()
      ? await QuizModel.findById(req.params.id).lean()
      : findQuizSnapshotById(req.params.id);

    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }

    res.json({ quiz });
  } catch (error) {
    next(error);
  }
});

quizzesRouter.post('/generate', async (req, res, next) => {
  try {
    const body = req.body as GenerateQuizRequestBody & { email?: string };

    if (!body?.pdfBase64) {
      res.status(400).json({ error: 'pdfBase64 is required.' });
      return;
    }

    let user = null;
    if (body.email) {
      user = await UserModel.findOne({ email: String(body.email).trim().toLowerCase() });
    }

    if (user && !user.isPremium) {
      if (typeof user.credits !== 'number' || user.credits <= 0) {
        res.status(402).json({ error: 'No tienes créditos suficientes para utilizar Gemini. Por favor compra Premium o recarga créditos.' });
        return;
      }
      user.credits -= 1;
      await user.save();
    }

    const generated = await generateQuestionsFromPdf({
      fileName: body.fileName,
      pdfBase64: body.pdfBase64,
      prompt: body.prompt,
    });

    const fileName = body.fileName ?? 'uploaded.pdf';
    const useDatabase = isDatabaseConnected();

    if (useDatabase) {
      const quiz = await QuizModel.create({
        fileName,
        prompt: generated.prompt,
        source: 'pdf',
        questions: generated.questions,
      });

      res.status(201).json({
        quiz: {
          id: quiz._id.toString(),
          fileName: quiz.fileName,
          prompt: quiz.prompt,
          source: quiz.source,
          questions: quiz.questions,
          createdAt: quiz.createdAt,
        },
      });
      return;
    }

    const quiz = saveQuizSnapshot({
      fileName,
      prompt: generated.prompt,
      source: 'pdf',
      questions: generated.questions,
    });

    res.status(201).json({
      quiz: {
        id: quiz.id,
        fileName: quiz.fileName,
        prompt: quiz.prompt,
        source: quiz.source,
        questions: quiz.questions,
        createdAt: quiz.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});
