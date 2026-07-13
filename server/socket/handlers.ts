import { Server as SocketIOServer, Socket } from 'socket.io';
import { RoomModel } from '../models/Room.js';
import { RoomPlayer, RoomRecord, TriviaQuestion } from '../types.js';

// Extender Socket para incluir datos personalizados
interface CustomSocket extends Socket {
  data: {
    roomCode?: string;
    username?: string;
  };
}

interface GameAnswerPayload {
  roomCode: string;
  username: string;
  questionId: number;
  answer: 'A' | 'B' | 'C' | 'D' | null;
  timeRemaining: number;
}

interface PlayerGameState {
  answers: Array<{ questionId: number; answer: 'A' | 'B' | 'C' | 'D' | null; timeRemaining: number }>;
  score: number;
  correct: number;
  streak: number; // Añadido para soportar las rachas de tu UI
}

interface GameSession {
  roomCode: string;
  questions: TriviaQuestion[];
  players: Record<string, PlayerGameState>;
  currentQuestionIndex: number; // Rastrea qué pregunta está activa globalmente
  timerDuration: number;        // Duración configurada por el host
  timerInterval?: NodeJS.Timeout; // Guardado del intervalo para limpiarlo o detenerlo
}

const gameSessions = new Map<string, GameSession>();

function calculateScore(isCorrect: boolean, timeRemaining: number): number {
  if (!isCorrect) {
    return 0;
  }
  return 1000 + Math.max(0, Math.round(timeRemaining * 12));
}

// Verifica si todos los jugadores respondieron la pregunta ACTUAL (Optimiza esperas)
function allPlayersAnsweredCurrentQuestion(session: GameSession): boolean {
  const currentQuestionId = session.questions[session.currentQuestionIndex]?.id;
  return Object.values(session.players).every((playerState) =>
    playerState.answers.some((ans) => ans.questionId === currentQuestionId)
  );
}

function makeLeaderboard(session: GameSession) {
  return Object.entries(session.players)
    .map(([username, stats]) => ({
      username,
      score: stats.score,
      correct: stats.correct,
      answered: stats.answers.length,
    }))
    .sort((a, b) => b.score - a.score);
}

interface JoinRoomPayload {
  roomCode: string;
  username: string;
  avatarId: string;
  email?: string;
}

interface StartGamePayload {
  roomCode: string;
}

// Función helper para emitir el estado de la sala
function emitRoomState(io: SocketIOServer, room: RoomRecord) {
  io.to(room.roomCode).emit('room:state', {
    roomCode: room.roomCode,
    status: room.status,
    players: room.players as RoomPlayer[],
    questions: room.questions,
    fileName: room.fileName,
    prompt: room.prompt,
    mode: room.mode,
    timer: room.timer,
    difficulty: room.difficulty,
    hostUsername: room.hostUsername,
  });
}

// --- FUNCIÓN DEL TEMPORIZADOR CENTRALIZADO ---
function startQuestionTimer(io: SocketIOServer, roomCode: string) {
  const session = gameSessions.get(roomCode);
  if (!session) return;

  let timeLeft = session.timerDuration;

  // Notificar el inicio de la cuenta regresiva para la pregunta actual
  io.to(roomCode).emit('game:timer_tick', timeLeft);

  session.timerInterval = setInterval(() => {
    timeLeft -= 1;
    io.to(roomCode).emit('game:timer_tick', timeLeft);

    if (timeLeft <= 0) {
      resolveCurrentQuestion(io, roomCode);
    }
  }, 1000);
}

// --- RESOLUCIÓN DE LA PREGUNTA ACTUAL ---
function resolveCurrentQuestion(io: SocketIOServer, roomCode: string) {
  const session = gameSessions.get(roomCode);
  if (!session) return;

  // Detener el reloj actual
  if (session.timerInterval) {
    clearInterval(session.timerInterval);
  }

  const currentQuestion = session.questions[session.currentQuestionIndex];

  // Forzar respuesta nula ('timeout') para los que no respondieron a tiempo
  Object.entries(session.players).forEach(([username, playerState]) => {
    const hasAnswered = playerState.answers.some((ans) => ans.questionId === currentQuestion.id);
    if (!hasAnswered) {
      playerState.answers.push({ questionId: currentQuestion.id, answer: null, timeRemaining: 0 });
      playerState.streak = 0; // Rompe racha por no contestar
    }
  });

  // Estructura de puntuaciones para que el cliente actualice su UI al unísono
  const playersScores = Object.entries(session.players).map(([username, state]) => ({
    username,
    points: state.score,
    streak: state.streak,
  }));

  // Emitir resolución: congela pantallas en el cliente y muestra la correcta
  io.to(roomCode).emit('game:question_resolved', {
    correctOption: currentQuestion.correctOption,
    playersScores,
  });

  // Esperar 5 segundos (pantalla de revelación) antes de decidir el siguiente paso
  setTimeout(() => {
    if (session.currentQuestionIndex < session.questions.length - 1) {
      // Avanzar a la siguiente pregunta
      session.currentQuestionIndex += 1;
      io.to(roomCode).emit('game:next_question', {
        nextIndex: session.currentQuestionIndex,
      });
      // Reiniciar el reloj para la nueva pregunta
      startQuestionTimer(io, roomCode);
    } else {
      // Fin del juego definitivo
      endGameSession(io, roomCode);
    }
  }, 5000);
}

// --- FINALIZACIÓN DE LA PARTIDA ---
async function endGameSession(io: SocketIOServer, roomCode: string) {
  const session = gameSessions.get(roomCode);
  if (!session) return;

  const leaderboard = makeLeaderboard(session);
  
  io.to(roomCode).emit('room:finished', {
    leaderboard,
    winner: leaderboard[0]?.username ?? null,
  });

  try {
    const room = await RoomModel.findOne({ roomCode });
    if (room) {
      room.status = 'finished';
      await room.save();
      emitRoomState(io, room.toObject());
    }
  } catch (error) {
    console.error(`[Socket.IO] Error al actualizar estado final en DB para la sala ${roomCode}:`, error);
  }

  // Limpieza absoluta de memoria para evitar fugas
  if (session.timerInterval) clearInterval(session.timerInterval);
  gameSessions.delete(roomCode);
}

export function setupSocketIO(io: SocketIOServer) {
  io.on('connection', (socket: CustomSocket) => {
    const socketInstance = socket; 
    console.log(`[Socket.IO] Cliente conectado: ${socket.id}`);

    // 1. UNIRSE A LA SALA (Participantes / Host)
    socket.on('room:join', async (payload: JoinRoomPayload) => {
      const { roomCode, username, avatarId, email } = payload;
      console.log(`[Socket.IO] ${username} (${socket.id}) intentando unirse a la sala: ${roomCode}`);

      if (!roomCode || !username) {
        socket.emit('roomError', { message: 'Faltan datos esenciales para unirse a la sala.' });
        return;
      }

      try {
        const room = await RoomModel.findOne({ roomCode });

        if (!room) {
          console.warn(`[Socket.IO] Sala ${roomCode} no encontrada para ${username}.`);
          socket.emit('roomError', { message: 'Sala no encontrada.' });
          return;
        }

        socketInstance.join(roomCode);
        socketInstance.data.roomCode = roomCode;
        socketInstance.data.username = username;

        const nextPlayer: RoomPlayer = {
          username,
          email,
          avatarId,
          isHost: room.hostUsername === username,
          isReady: room.hostUsername === username,
          socketId: socket.id,
        };

        const existingPlayerIndex = room.players.findIndex(
          (p) => p.username.toLowerCase() === username.toLowerCase()
        );

        if (existingPlayerIndex >= 0) {
          room.players[existingPlayerIndex] = {
            ...room.players[existingPlayerIndex],
            ...nextPlayer,
          };
        } else {
          room.players.push(nextPlayer);
        }

        await room.save();
        console.log(`[Socket.IO] ${username} (${socket.id}) se unió a la sala: ${roomCode}`);

        emitRoomState(io, room.toObject());
      } catch (error) {
        console.error(`[Socket.IO] Error al unirse a la sala ${roomCode}:`, error);
        socket.emit('roomError', { message: 'Error interno del servidor al unirse a la sala.' });
      }
    });

    // 2. INICIAR PARTIDA (Solo ejecutado por el Anfitrión)
    socket.on('room:start', async (payload: StartGamePayload) => {
      const roomCode = payload?.roomCode ?? socket.data.roomCode;
      if (!roomCode) {
        socket.emit('roomError', { message: 'Código de sala no proporcionado.' });
        return;
      }

      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) {
          socket.emit('roomError', { message: 'Sala no encontrada para iniciar el juego.' });
          return;
        }

        room.status = 'live';
        await room.save();

        // Inicialización de la sesión multijugador con control de preguntas
        const session: GameSession = {
          roomCode,
          questions: room.questions as TriviaQuestion[],
          players: {},
          currentQuestionIndex: 0,
          timerDuration: room.timer || 30, // Usa el tiempo configurado en la DB por el creador
        };

        room.players.forEach((player) => {
          session.players[player.username] = {
            answers: [],
            score: 0,
            correct: 0,
            streak: 0,
          };
        });

        gameSessions.set(roomCode, session);

        // Notificar inicio a los clientes locales
        io.to(roomCode).emit('room:started', {
          roomCode: room.roomCode,
          status: room.status,
          questions: room.questions,
        });

        io.to(roomCode).emit('game:session', {
          questionCount: session.questions.length,
          mode: room.mode,
          difficulty: room.difficulty,
        });

        emitRoomState(io, room.toObject());
        console.log(`[Socket.IO] Sala ${roomCode} iniciada por ${socket.data.username}.`);

        // Desencadenar el temporizador centralizado de la primera pregunta
        startQuestionTimer(io, roomCode);

      } catch (error) {
        console.error(`[Socket.IO] Error al iniciar la sala ${roomCode}:`, error);
        socket.emit('roomError', { message: 'Error interno del servidor al iniciar la sala.' });
      }
    });

    // 3. RECIBIR RESPUESTA INDIVIDUAL EN TIEMPO REAL
    socket.on('game:answer', async (payload: GameAnswerPayload) => {
      const { roomCode, username, questionId, answer, timeRemaining } = payload;
      if (!roomCode || !username) {
        socket.emit('roomError', { message: 'Datos de respuesta incompletos.' });
        return;
      }

      const session = gameSessions.get(roomCode);
      if (!session) {
        socket.emit('roomError', { message: 'Sesión de juego no encontrada.' });
        return;
      }

      const playerState = session.players[username];
      if (!playerState) {
        socket.emit('roomError', { message: 'Jugador no registrado en esta sesión.' });
        return;
      }

      // Evitar procesamiento duplicado si ya mandó respuesta para esta pregunta
      if (playerState.answers.some((item) => item.questionId === questionId)) {
        return;
      }

      const question = session.questions.find((item) => item.id === questionId);
      if (!question) {
        socket.emit('roomError', { message: 'Pregunta no encontrada.' });
        return;
      }

      const isCorrect = answer === question.correctOption;
      playerState.answers.push({ questionId, answer, timeRemaining });
      
      if (isCorrect) {
        playerState.score += calculateScore(isCorrect, timeRemaining);
        playerState.correct += 1;
        playerState.streak += 1; // Incrementa racha de aciertos continuos
      } else {
        playerState.streak = 0;   // Resetea racha por error
      }

      // Sincronizar actualización inmediata para barras de carga o feed dinámico
      io.to(roomCode).emit('game:player:update', {
        username,
        score: playerState.score,
        correct: playerState.correct,
        streak: playerState.streak,
        answered: playerState.answers.length,
        total: session.questions.length,
      });

      // UX Premium: Si TODOS los jugadores ya respondieron la pregunta actual,
      // no los hagas esperar a que el segundero llegue a 0. ¡Resuelve de inmediato!
      if (allPlayersAnsweredCurrentQuestion(session)) {
        resolveCurrentQuestion(io, roomCode);
      }
    });

    // 4. MANEJO DE DESCONEXIONES (Seguridad ante caídas de red)
    socket.on('disconnect', async () => {
      console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`);
      const roomCode = socket.data.roomCode;
      const username = socket.data.username;

      if (!roomCode || !username) {
        return;
      }

      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) return;

        // Remover jugador de la lista
        room.players = room.players.filter(
          (player) => player.username.toLowerCase() !== username.toLowerCase()
        );

        // Control de desconexión del host
        if (room.hostUsername.toLowerCase() === username.toLowerCase()) {
          if (room.players.length > 0) {
            room.players[0].isHost = true;
            room.hostUsername = room.players[0].username;
          } else {
            // Limpiar intervalos de tiempo si la sala queda vacía
            const session = gameSessions.get(roomCode);
            if (session?.timerInterval) clearInterval(session.timerInterval);
            gameSessions.delete(roomCode);

            await RoomModel.deleteOne({ roomCode });
            return;
          }
        }

        await room.save();
        emitRoomState(io, room.toObject());
      } catch (error) {
        console.error(`[Socket.IO] Error al manejar desconexión de ${username}:`, error);
      }
    });
  });
}