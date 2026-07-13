import mongoose, { type Model } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface UserRecord {
  username: string;
  email: string;
  institution: string;
  bio: string;
  passwordHash?: string;
  authProvider: 'local' | 'google';
  googleId?: string;
  level: number;
  xp: number;
  maxXp: number;
  coins: number;
  credits: number;
  avatarId: string;
  isPremium: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<UserRecord>(
  {
    username: { type: String, required: true, trim: true, unique: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    institution: { type: String, required: true, default: 'Academia StudyClash' },
    bio: { type: String, required: true, default: '¡Listo para competir y aprender!' },
    authProvider: { type: String, required: true, enum: ['local', 'google'], default: 'local' },
    googleId: { type: String, index: true, sparse: true },
    passwordHash: {
      type: String,
      required(this: UserRecord) {
        return this.authProvider === 'local';
      },
    },
    level: { type: Number, required: true, default: 1 },
    xp: { type: Number, required: true, default: 0 },
    maxXp: { type: Number, required: true, default: 1000 },
    coins: { type: Number, required: true, default: 100 },
    credits: { type: Number, required: true, default: 5 },
    avatarId: { type: String, required: true, default: 'cyber_scholar' },
    isPremium: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

export const UserModel: Model<UserRecord> =
  (models.User as Model<UserRecord>) ?? model<UserRecord>('User', userSchema);
