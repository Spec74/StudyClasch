import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { TriviaQuestion } from '../types.js';
import { stripJsonFences } from '../utils/stringUtils.js'; // Import the utility

const DEFAULT_PROMPT = [
  'Analiza el PDF y crea 10 preguntas tipo Kahoot en español.',
  'Devuelve solo un JSON array válido, sin markdown ni texto extra.',
  'Cada objeto debe tener esta forma exacta:',
  '{"id":1,"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correctOption":"A"}',
  'Las preguntas deben basarse únicamente en el contenido del PDF, incluir opciones plausibles y variar la dificultad.',
].join(' ');

function normalizeQuestions(parsed: unknown): TriviaQuestion[] {
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item: any, index: number): TriviaQuestion => ({
      id: Number.isFinite(Number(item?.id)) ? Number(item.id) : index + 1,
      question: String(item?.question ?? '').trim(),
      options: {
        A: String(item?.options?.A ?? '').trim(),
        B: String(item?.options?.B ?? '').trim(),
        C: String(item?.options?.C ?? '').trim(),
        D: String(item?.options?.D ?? '').trim(),
      },
      correctOption: ['A', 'B', 'C', 'D'].includes(item?.correctOption)
        ? item.correctOption
        : 'A',
    }))
    .filter((question) => {
      return (
        question.question.length > 0 &&
        Object.values(question.options).every((option) => option.length > 0)
      );
    })
    .slice(0, 10);
}

export async function generateQuestionsFromPdf(input: {
  fileName?: string;
  pdfBase64: string;
  prompt?: string;
}): Promise<{ questions: TriviaQuestion[]; prompt: string }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required on the server.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = input.prompt?.trim() || DEFAULT_PROMPT;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash', // Switch to the 2.5 Pro model for potentially wider availability
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
  });

  const result = await model.generateContent([
    prompt,
    {
        inlineData: {
          mimeType: 'application/pdf',
          data: input.pdfBase64,
        },
    },
  ]);

  const response = result.response;
  const text = response.text();
  const parsed = JSON.parse(stripJsonFences(text ?? '[]'));
  const questions = normalizeQuestions(parsed);

  if (questions.length === 0) {
    throw new Error('Gemini no devolvió una lista de preguntas válida. El contenido del PDF puede ser inadecuado o ilegible.');
  }

  return {
    questions,
    prompt,
  };
}
