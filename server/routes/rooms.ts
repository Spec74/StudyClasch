import { Router } from 'express';
import { RoomModel } from '../models/Room.js';
import type { CreateRoomRequestBody, JoinRoomRequestBody } from '../types.js';
import { generateRoomCode } from '../utils/roomUtils.js';

export const roomsRouter = Router();

async function createUniqueRoomCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const roomCode = generateRoomCode();
    const existing = await RoomModel.findOne({ roomCode }).lean();
    if (!existing) {
      return roomCode;
    }
  }
  throw new Error('No se pudo generar un código de sala único.');
}

function toRoomResponse(room: any) {
  return {
    id: room._id?.toString?.() ?? room.id,
    roomCode: room.roomCode,
    hostUsername: room.hostUsername,
    status: room.status,
    fileName: room.fileName,
    prompt: room.prompt,
    questions: room.questions,
    mode: room.mode,
    timer: room.timer,
    difficulty: room.difficulty,
    players: room.players,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

roomsRouter.post('/', async (req, res, next) => {
  try {
    const { hostUsername, hostEmail, hostAvatarId, mode, timer, difficulty, fileName, prompt } = req.body as CreateRoomRequestBody;

    if (!hostUsername || !hostAvatarId) {
      res.status(400).json({ error: 'hostUsername and hostAvatarId are required.' });
      return;
    }

    const roomCode = await createUniqueRoomCode();

    const room = await RoomModel.create({
      roomCode,
      hostUsername,
      status: 'lobby',
      fileName: fileName ?? 'uploaded.pdf',
      prompt: prompt ?? 'Generated from PDF',
      mode: mode ?? 'BATTLE_ROYALE',
      timer: timer ?? 30,
      difficulty: difficulty ?? 'NORMAL',
      players: [
        {
          username: hostUsername,
          email: hostEmail,
          avatarId: hostAvatarId,
          isHost: true,
          isReady: true,
        },
      ],
    });

    res.status(201).json({ room: toRoomResponse(room) });
  } catch (error) {
    next(error);
  }
});

roomsRouter.get('/:roomCode', async (req, res, next) => {
  try {
    const room = await RoomModel.findOne({ roomCode: req.params.roomCode }).lean();

    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    res.json({ room: toRoomResponse(room) });
  } catch (error) {
    next(error);
  }
});

roomsRouter.post('/:roomCode/join', async (req, res, next) => {
  try {
    const body = req.body as JoinRoomRequestBody;
    const room = await RoomModel.findOne({ roomCode: req.params.roomCode });

    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    const player = body?.player;
    if (!player?.username) {
      res.status(400).json({ error: 'player.username is required.' });
      return;
    }

    const existingPlayerIndex = room.players.findIndex((item) =>
      item.username.toLowerCase() === player.username.toLowerCase()
    );

    const nextPlayer = {
      username: player.username,
      email: player.email,
      avatarId: player.avatarId,
      isHost: Boolean(player.isHost),
      isReady: Boolean(player.isReady),
    };

    if (existingPlayerIndex >= 0) {
      room.players[existingPlayerIndex] = {
        ...room.players[existingPlayerIndex],
        ...nextPlayer,
      };
    } else {
      room.players.push(nextPlayer);
    }

    await room.save();

    const response = toRoomResponse(room);
    res.json({ room: response });
  } catch (error) {
    next(error);
  }
});

roomsRouter.post('/:roomCode/start', async (req, res, next) => {
  try {
    const room = await RoomModel.findOne({ roomCode: req.params.roomCode });

    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    room.status = 'live';
    await room.save();

    const response = toRoomResponse(room);
    res.json({ room: response });
  } catch (error) {
    next(error);
  }
});