export enum AppScreen {
  HOME = 'HOME',
  PLAY_UPLOAD = 'PLAY_UPLOAD',
  PLAY_CONFIG = 'PLAY_CONFIG',
  PLAY_LOBBY = 'PLAY_LOBBY',
  PLAY_GAME = 'PLAY_GAME',
  PLAY_GAMEOVER = 'PLAY_GAMEOVER',
  SHOP = 'SHOP',
  PROFILE = 'PROFILE',
  EDIT_PROFILE = 'EDIT_PROFILE'
}

export enum GameMode {
  DUEL_1V1 = 'DUEL_1V1',
  BATTLE_ROYALE = 'BATTLE_ROYALE',
  COOP = 'COOP'
}

export enum Difficulty {
  EASY = 'EASY',
  NORMAL = 'NORMAL',
  HARD = 'HARD'
}

export interface UserProfile {
  email?: string;
  username: string;
  institution: string;
  bio: string;
  level: number;
  xp: number;
  maxXp: number;
  coins: number;
  credits: number;
  avatarId: string;
  isPremium: boolean;
}

export interface CosmeticItem {
  id: string;
  name: string;
  image: string;
  type: 'skin' | 'powerup';
  status: 'equipped' | 'unlocked' | 'locked';
  price?: number;
  isPremiumExclusive: boolean;
  description: string;
}
