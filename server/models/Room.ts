import mongoose, { type Model } from 'mongoose';
import type { TriviaQuestion, TriviaQuestionOptions, RoomPlayer, RoomRecord } from '../types.js';

const { model, models, Schema } = mongoose;

// Define un esquema para las opciones de TriviaQuestion
const triviaQuestionOptionsSchema = new Schema<TriviaQuestionOptions>(
  {
    A: { type: String, required: true },
    B: { type: String, required: true },
    C: { type: String, required: true },
    D: { type: String, required: true },
  },
  { _id: false } // No necesitamos un _id para este subdocumento
);

// Define un esquema para TriviaQuestion
const triviaQuestionSchema = new Schema<TriviaQuestion>(
  {
    id: { type: Number, required: true },
    question: { type: String, required: true },
    options: { type: triviaQuestionOptionsSchema, required: true },
    correctOption: { type: String, required: true, enum: ['A', 'B', 'C', 'D'] },
  },
  { _id: false } // No necesitamos un _id para este subdocumento
);

const roomPlayerSchema = new Schema<RoomPlayer>(
  {
    username: { type: String, required: true },
    email: { type: String },
    avatarId: { type: String, required: true },
    isHost: { type: Boolean, required: true, default: false },
    isReady: { type: Boolean, required: true, default: false },
    socketId: { type: String },
  },
  { _id: false }
);

const roomSchema = new Schema<RoomRecord>(
  {
    roomCode: { type: String, required: true, unique: true, index: true },
    hostUsername: { type: String, required: true },
    status: { type: String, required: true, default: 'lobby' },
    fileName: { type: String, required: true },
    prompt: { type: String, required: true },
    questions: { type: [triviaQuestionSchema], required: false, default: [] },
    mode: { type: String, required: true, default: 'BATTLE_ROYALE' },
    timer: { type: Number, required: true, default: 30 },
    difficulty: { type: String, required: true, default: 'NORMAL' },
    players: { type: [roomPlayerSchema], required: true, default: [] },
  },
  { timestamps: true }
);

export const RoomModel: Model<RoomRecord> = (models.Room as Model<RoomRecord>) ?? model<RoomRecord>('Room', roomSchema);