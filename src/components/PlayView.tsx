import { useState, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppScreen, UserProfile, GameMode, Difficulty, CosmeticItem } from '../types';
import { TriviaQuestion, RoomRecord, RoomPlayer } from '../../server/types.js';
import { HISTORY_QUESTIONS, MARKETING_QUESTIONS } from '../data';
import { 
  ArrowLeft, FileUp, Sparkles, AlertCircle, CheckCircle, 
  Trash2, ArrowRight, Play, Users, Copy, Check, Timer, 
  HelpCircle, Trophy, RotateCcw, LayoutDashboard, Star, Lock, Flame
} from 'lucide-react';
import io from 'socket.io-client';

interface PlayViewProps {
  user: UserProfile;
  activeAvatarImage: string;
  onOpenPremium: () => void;
  onNavigate: (screen: AppScreen) => void;
  onCompleteGame: (correct: number, points: number, xp: number, coins: number) => void;
  cosmetics: CosmeticItem[];
  currentScreen: AppScreen;
  setCurrentScreen: (screen: AppScreen) => void;
  joinRoomCode?: string; // Código para unirse a una sala existente
}

const defaultApiUrl = 'http://localhost:4001';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiUrl;

export default function PlayView({
  user,
  activeAvatarImage,
  onOpenPremium,
  onNavigate,
  onCompleteGame,
  currentScreen,
  setCurrentScreen,
  cosmetics,
  joinRoomCode
}: PlayViewProps) {
  
  // --- Estados locales del componente. React gestionará su persistencia. ---
  const [socket, setSocket] = useState<ReturnType<typeof io> | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [currentRoom, setCurrentRoom] = useState<RoomRecord | null>(null);
  const [questions, setQuestions] = useState<TriviaQuestion[]>(HISTORY_QUESTIONS);

  // --- Upload State ---
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string; category?: 'history' | 'marketing'; source: 'upload' | 'sample' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // --- Match Config State ---
  const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.BATTLE_ROYALE);
  const [selectedTimer, setSelectedTimer] = useState<number>(30);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.NORMAL);

  // --- Lobby State ---
  const [copySuccess, setCopySuccess] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<RoomPlayer[]>([]);

  // --- Quiz Engine State ---
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [gameCountdown, setGameCountdown] = useState(30);
  const [selectedAnswer, setSelectedAnswer] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [answerFrozen, setAnswerFrozen] = useState(false);
  // Estado del jugador (puntuación, racha) controlado por el servidor
  const [playerStats, setPlayerStats] = useState({ score: 0, streak: 0, correct: 0 });
  const [resolvedCorrectAnswer, setResolvedCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [gameOverData, setGameOverData] = useState<{ leaderboard: any[], winner: string | null } | null>(null);

  // Inicializar Socket una sola vez y no desconectarlo al recargar
  // Se conecta cuando el componente se monta y se desconecta cuando se desmonta.
  useEffect(() => {
    const newSocket = io(apiBaseUrl);
    setSocket(newSocket);

    // Limpieza: desconectar el socket cuando el componente se desmonte
    return () => {
      newSocket.disconnect();
    };
  }, []); // El array vacío asegura que esto solo se ejecute una vez

  // Efecto para manejar la unión a una sala desde fuera (p. ej. HomeView)
  useEffect(() => {
    // Si se proporciona un código para unirse y estamos en la pantalla del lobby,
    // establece el código de la sala para activar el proceso de unión.
    if (joinRoomCode && currentScreen === AppScreen.PLAY_LOBBY) {
      setRoomCode(joinRoomCode);
    }
  }, [joinRoomCode, currentScreen]);

  const handleSelectPredefinedFile = (category: 'history' | 'marketing') => {
    setIsUploading(true);
    setUploadProgress(0);
    setGenerationError(null);
    const fileName = category === 'history' ? 'Apuntes_Historia_Moderna.pdf' : 'Fundamentos_Marketing_TEMA3.pdf';
    const fileSize = category === 'history' ? '2.4 MB' : '1.8 MB';

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          setSelectedFile({ name: fileName, size: fileSize, category, source: 'sample' });
          setQuestions(category === 'marketing' ? MARKETING_QUESTIONS : HISTORY_QUESTIONS);
          return 100;
        }
        return prev + 20;
      });
    }, 150);
  };

  const readFileAsBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  };

  const generateQuestionsFromPdf = async (file: File): Promise<TriviaQuestion[]> => {
    const pdfBase64 = await readFileAsBase64(file);
    const fetchUrl = apiBaseUrl + '/api/quizzes/generate';
    
    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        pdfBase64,
        email: user.email,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? 'Error del backend.');

    const normalizedQuestions = Array.isArray(payload?.quiz?.questions)
      ? payload.quiz.questions
      : Array.isArray(payload?.questions)
      ? payload.questions
      : [];

    if (normalizedQuestions.length === 0) throw new Error('Sin preguntas válidas.');
    return normalizedQuestions;
  };

  const handleCustomFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        alert('Solo PDF.');
        return;
      }
      setGenerationError(null);
      setIsGeneratingQuestions(false);
      setIsUploading(true);
      setUploadProgress(0);

      const startProcessing = async () => {
        let aiQuestions: TriviaQuestion[] = [];
        const progressPromise = new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            setUploadProgress((prev) => {
              if (prev >= 100) {
                clearInterval(interval);
                resolve();
                return 100;
              }
              return prev + 10;
            });
          }, 100);
        });

        try {
          await progressPromise;
          setIsUploading(false);
          setSelectedFile({
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            source: 'upload',
          });
          setIsGeneratingQuestions(true);

          aiQuestions = await generateQuestionsFromPdf(file);
          setQuestions(aiQuestions);
        } catch (error) {
          setGenerationError(error instanceof Error ? error.message : 'Error.');
          setQuestions(HISTORY_QUESTIONS);
        } finally {
          setIsGeneratingQuestions(false);
        }
      };
      void startProcessing();
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setIsUploading(false);
    setIsGeneratingQuestions(false);
    setGenerationError(null);
    setQuestions(HISTORY_QUESTIONS);
  };

  const handleCreateRoom = async () => {
    setGenerationError(null);
    if (questions.length === 0) {
      setGenerationError('No hay preguntas.');
      return;
    }

    try {
      const fetchUrl = apiBaseUrl + '/api/rooms';
      const createRoomResponse = await fetch(fetchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostUsername: user.username,
          hostEmail: user.email,
          hostAvatarId: user.avatarId,
          mode: selectedMode,
          timer: selectedTimer,
          difficulty: selectedDifficulty,
          fileName: selectedFile?.name || 'Untitled.pdf',
          prompt: 'Generated from PDF',
        }),
      });

      const roomPayload = await createRoomResponse.json().catch(() => ({}));
      console.log("🔥 RESPUESTA AL CREAR SALA:", roomPayload);

      if (!createRoomResponse.ok) throw new Error(roomPayload?.error ?? 'Error creando sala.');

      const newRoomCode = roomPayload.room?.roomCode;
      if (!newRoomCode) {
        throw new Error('El backend no devolvió el código de sala.');
      }

      setRoomCode(newRoomCode);
      setCurrentRoom(roomPayload.room);
      setCurrentScreen(AppScreen.PLAY_LOBBY);
    } catch (roomError) {
      setGenerationError(roomError instanceof Error ? roomError.message : 'Error al crear.');
    }
  };

  // --- Lógica del Socket conectada al Lobby ---
  useEffect(() => {
    if (!socket || currentScreen !== AppScreen.PLAY_LOBBY || !roomCode || !user) return;

    const joinRoom = () => {
      console.log("🔥 UNIÉNDOSE A SALA:", roomCode);
      socket.emit('room:join', {
        roomCode,
        username: user.username,
        avatarId: user.avatarId,
        email: user.email,
      });
    };

    const onRoomState = (data: RoomRecord) => {
      setCurrentRoom(data);
      setRoomCode(data.roomCode);
      setLobbyPlayers(data.players);
    };

    const onRoomStarted = (data: { roomCode: string; status: 'lobby' | 'live' | 'finished'; questions: TriviaQuestion[] }) => {
      if (currentRoom) {
        setCurrentRoom({ ...currentRoom, status: data.status, questions: data.questions });
      }
      setQuestions(data.questions);
      handleStartQuiz();
    };

    const onRoomError = (data: { message: string }) => {
      setGenerationError(data.message);
    };

    socket.on('room:state', onRoomState);
    socket.on('room:started', onRoomStarted);
    socket.on('roomError', onRoomError);

    if (socket.connected) {
      joinRoom();
    } else {
      socket.once('connect', joinRoom);
    }

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:started', onRoomStarted);
      socket.off('roomError', onRoomError);
      socket.off('connect', joinRoom);
    };
  }, [currentScreen, roomCode, user, socket]);

  const handleCopyLink = async () => {
    navigator.clipboard.writeText(window.location.origin + '/room/' + roomCode);
    setCopySuccess(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setCopySuccess(false);
  };

  const handleStartGameAsHost = () => {
    if (!socket || !roomCode) return;
    if (currentRoom?.hostUsername !== user.username) return;
    socket.emit('room:start', { roomCode, questions });
  };

  const handleStartQuiz = () => {
    setCurrentQuestionIndex(0);
    setGameCountdown(selectedTimer);
    setPlayerStats({ score: 0, streak: 0, correct: 0 });
    setSelectedAnswer(null);
    setAnswerFrozen(false);
    setResolvedCorrectAnswer(null);
    setGameOverData(null);
    setCurrentScreen(AppScreen.PLAY_GAME);
  };

  // --- Lógica del Socket conectada al Juego ---
  useEffect(() => {
    if (!socket || currentScreen !== AppScreen.PLAY_GAME) return;

    const onTimerTick = (timeLeft: number) => setGameCountdown(timeLeft);

    const onPlayerUpdate = (data: { username: string; score: number; streak: number; correct: number }) => {
      if (data.username === user.username) {
        setPlayerStats({ score: data.score, streak: data.streak, correct: data.correct });
      }
    };

    const onQuestionResolved = (data: { correctOption: 'A' | 'B' | 'C' | 'D', playersScores: any[] }) => {
      setAnswerFrozen(true);
      setResolvedCorrectAnswer(data.correctOption);
    };

    const onNextQuestion = (data: { nextIndex: number }) => {
      setCurrentQuestionIndex(data.nextIndex);
      setSelectedAnswer(null);
      setAnswerFrozen(false);
      setResolvedCorrectAnswer(null);
    };

    const onRoomFinished = (data: { leaderboard: any[], winner: string | null }) => {
      // FIX: The leaderboard from the server contains the final scores, but sometimes
      // the avatarId can be lost in the server-side process. We enrich the leaderboard
      // data with the avatar information we already have from the lobby state (`lobbyPlayers`).
      const enrichedLeaderboard = data.leaderboard.map(leaderboardPlayer => {
        const lobbyPlayerInfo = lobbyPlayers.find(p => p.username === leaderboardPlayer.username);
        return {
          ...leaderboardPlayer,
          // Use the avatarId from the lobby info if available, as a reliable fallback.
          avatarId: lobbyPlayerInfo?.avatarId || leaderboardPlayer.avatarId,
        };
      });
      setGameOverData({ ...data, leaderboard: enrichedLeaderboard });
      const myStats = enrichedLeaderboard.find(p => p.username === user.username);
      if (myStats) {
        const gainedCoins = myStats.correct * 10 + (user.isPremium ? 20 : 0);
        const gainedXp = myStats.correct * 15 * (user.isPremium ? 2 : 1);
        onCompleteGame(myStats.correct, myStats.score, gainedXp, gainedCoins);
      } else {
        onCompleteGame(0, 0, 0, 0);
      }
      setCurrentScreen(AppScreen.PLAY_GAMEOVER);
    };

    socket.on('game:timer_tick', onTimerTick);
    socket.on('game:player:update', onPlayerUpdate);
    socket.on('game:question_resolved', onQuestionResolved);
    socket.on('game:next_question', onNextQuestion);
    socket.on('room:finished', onRoomFinished);

    return () => {
      socket.off('game:timer_tick', onTimerTick);
      socket.off('game:player:update', onPlayerUpdate);
      socket.off('game:question_resolved', onQuestionResolved);
      socket.off('game:next_question', onNextQuestion);
      socket.off('room:finished', onRoomFinished);
    };
  }, [socket, currentScreen, user.username, onCompleteGame, setCurrentScreen]);

  const handleAnswerSelect = (option: 'A' | 'B' | 'C' | 'D' | null) => {
    // [CORRECCIÓN] Si ya se ha seleccionado una respuesta para esta pregunta (selectedAnswer no es null)
    // o si la pregunta ya ha sido resuelta por el servidor (answerFrozen es true), no hacer nada.
    // Esto asegura que el bloqueo sea individual y previene múltiples envíos.
    if (selectedAnswer !== null || answerFrozen || !socket || !roomCode) return;

    // Solo establecemos la respuesta seleccionada. Esto dará feedback visual y
    // deshabilitará los botones en la siguiente renderización gracias a la nueva condición del `disabled`.
    setSelectedAnswer(option);

    const activeQuestion = questions[currentQuestionIndex];
    if (!activeQuestion) return;

    socket.emit('game:answer', {
      roomCode,
      username: user.username,
      questionId: activeQuestion.id,
      answer: option,
      timeRemaining: gameCountdown,
    });
  };

  const handleResetFlow = () => {
    setSelectedFile(null);
    setSelectedMode(GameMode.BATTLE_ROYALE);
    setSelectedTimer(30);
    setSelectedDifficulty(Difficulty.NORMAL);
    
    // Limpiamos el estado local
    setRoomCode('');
    setCurrentRoom(null);
    setCurrentScreen(AppScreen.PLAY_UPLOAD);
  };

  const handleGoHome = () => {
    setRoomCode('');
    setCurrentRoom(null);
    onNavigate(AppScreen.HOME);
  };

  const leaderboard = gameOverData?.leaderboard ?? [];
  const firstPlace = leaderboard.length > 0 ? leaderboard[0] : null;
  const secondPlace = leaderboard.length > 1 ? leaderboard[1] : null;
  const thirdPlace = leaderboard.length > 2 ? leaderboard[2] : null;
  const myRank = leaderboard.findIndex(p => p.username === user.username) + 1;

  return (
    <div className="w-full max-w-2xl mx-auto pb-12 relative">
      {/* ----------------- STAGE 1: UPLOAD PDF ----------------- */}
      {currentScreen === AppScreen.PLAY_UPLOAD && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={handleGoHome} className="text-[#2b6cb0] hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-full transition-colors active:scale-95">
                <ArrowLeft size={18} />
              </button>
              <h2 className="font-display font-extrabold text-lg text-gray-800 dark:text-white">Crear Sala</h2>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full text-xs font-bold text-[#2b6cb0]">
              LVL {user.level}
            </div>
          </div>

          <div className="bg-white dark:bg-[#1e293b] p-5 rounded-3xl border border-gray-100 dark:border-gray-800/80 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 dark:bg-blue-900/40 text-[#2b6cb0] text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-wide">Paso 1</span>
              <p className="font-display font-extrabold text-base text-gray-800 dark:text-white">Sube tu PDF de clase</p>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="w-1/3 h-full bg-[#2b6cb0] rounded-full" />
            </div>
          </div>

          {!selectedFile ? (
            <div className="space-y-6">
              <div onClick={() => document.getElementById('pdf-file-picker')?.click()} className={`relative group cursor-pointer w-full aspect-[2/1] md:aspect-[5/2] bg-white dark:bg-[#1e293b] border-4 border-dashed rounded-[2rem] flex flex-col items-center justify-center p-6 text-center transition-all duration-300 ${isUploading ? 'border-[#2b6cb0] bg-blue-50/10' : 'border-gray-200 dark:border-gray-800 hover:border-[#2b6cb0] hover:bg-blue-50/5'}`}>
                <input type="file" id="pdf-file-picker" accept=".pdf" onChange={handleCustomFileUpload} className="hidden" />
                {isUploading || isGeneratingQuestions ? (
                  <div className="space-y-3">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto animate-bounce">
                      <FileUp size={32} className="text-[#2b6cb0]" />
                    </div>
                    <p className="font-bold text-gray-800 dark:text-white">{isGeneratingQuestions ? 'Gemini está creando tu cuestionario...' : 'Procesando apuntes en la nube...'}</p>
                    <div className="w-48 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mx-auto overflow-hidden">
                      <div className="h-full bg-[#2b6cb0] transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                      <FileUp size={28} className="text-[#2b6cb0]" />
                    </div>
                    <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white mb-1">Toca para subir tu PDF de clase</h3>
                    <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">Arrastra o selecciona el archivo para comenzar la aventura. Máx. 10MB • Solo formato PDF</p>
                  </>
                )}
              </div>

              <div className="space-y-3">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-1 block">O prueba con apuntes de ejemplo rápidos:</span>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => handleSelectPredefinedFile('history')} className="p-4 bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-gray-800/80 rounded-2xl hover:border-blue-400 text-left transition-all bouncy-tap shadow-sm">
                    <h4 className="font-bold text-xs text-gray-800 dark:text-white mb-0.5 truncate">Apuntes de Historia</h4>
                    <p className="text-[10px] text-gray-400">Revolución Francesa y más • 2.4 MB</p>
                  </button>
                  <button onClick={() => handleSelectPredefinedFile('marketing')} className="p-4 bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-gray-800/80 rounded-2xl hover:border-blue-400 text-left transition-all bouncy-tap shadow-sm">
                    <h4 className="font-bold text-xs text-gray-800 dark:text-white mb-0.5 truncate">Fundamentos de Marketing</h4>
                    <p className="text-[10px] text-gray-400">Las 4 Ps, FODA y más • 1.8 MB</p>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-md border border-emerald-500/20 text-center animate-pulse">
                <div className="absolute top-4 right-4 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  <CheckCircle size={14} className="fill-current text-white dark:text-transparent" />
                  <span>Archivo cargado</span>
                </div>
                <div className="w-16 h-16 bg-red-50 dark:bg-red-950/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-red-500 text-4xl select-none">picture_as_pdf</span>
                </div>
                <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white mb-1 truncate px-4">{selectedFile.name}</h3>
                <p className="text-xs text-gray-400">{selectedFile.size} • {isGeneratingQuestions ? 'Analizando el PDF con Gemini' : 'Listo para jugar'}</p>
              </div>

              {generationError && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4 rounded-2xl text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  {generationError} Se usará el banco de preguntas de respaldo.
                </div>
              )}

              <div className="space-y-3">
                <button onClick={() => setCurrentScreen(AppScreen.PLAY_CONFIG)} disabled={isGeneratingQuestions} className="w-full bg-[#2b6cb0] hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all bouncy-tap">
                  {isGeneratingQuestions ? 'Generando con Gemini...' : 'Ir a Configuración'} <ArrowRight size={16} />
                </button>
                <button onClick={handleRemoveFile} className="w-full bg-red-50 dark:bg-red-950/20 hover:bg-red-100 text-red-600 dark:text-red-400 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors">
                  <Trash2 size={14} /> Eliminar y cambiar archivo
                </button>
              </div>
            </div>
          )}

          <div className="bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 p-4 rounded-2xl flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-[#2b6cb0] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Utiliza tus apuntes, resúmenes, lecturas o capítulos de libros. StudyClash analizará el contenido para generar automáticamente preguntas de trivia dinámicas adaptadas.
            </p>
          </div>
        </motion.div>
      )}

      {/* ----------------- STAGE 2: MATCH CONFIGURATION ----------------- */}
      {currentScreen === AppScreen.PLAY_CONFIG && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentScreen(AppScreen.PLAY_UPLOAD)} className="text-[#2b6cb0] hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-full transition-colors active:scale-95">
                <ArrowLeft size={18} />
              </button>
              <h2 className="font-display font-extrabold text-lg text-gray-800 dark:text-white">Configurar Partida</h2>
            </div>
            <div className="bg-[#2b6cb0] text-white px-3 py-1 rounded-full text-xs font-bold">LVL {user.level}</div>
          </div>

          <div className="bg-white dark:bg-[#1e293b] p-5 rounded-3xl border border-gray-100 dark:border-gray-800/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-sans text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block">Paso 2: CONFIGURA TU PARTIDA</span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">60% Completado</span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="w-3/5 h-full bg-[#2b6cb0] rounded-full shadow-sm" />
            </div>
          </div>

          <section className="space-y-3">
            <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white pl-1">Selecciona el Modo de Juego</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button onClick={() => setSelectedMode(GameMode.DUEL_1V1)} className={`p-5 bg-white dark:bg-[#1e293b] rounded-3xl text-left border-2 flex flex-col justify-between hover:border-[#2b6cb0] shadow-sm hover:shadow-md transition-all h-40 group bouncy-tap ${selectedMode === GameMode.DUEL_1V1 ? 'border-[#2b6cb0] ring-4 ring-blue-500/10' : 'border-gray-100 dark:border-gray-800/80'}`}>
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/20 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-xl select-none" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Duelo 1v1</h4>
                  <p className="text-[10px] text-gray-400 leading-tight">Competencia rápida cara a cara con otro estudiante.</p>
                </div>
              </button>
              <button onClick={() => setSelectedMode(GameMode.BATTLE_ROYALE)} className={`p-5 bg-white dark:bg-[#1e293b] rounded-3xl text-left border-2 flex flex-col justify-between hover:border-[#2b6cb0] shadow-sm hover:shadow-md transition-all h-40 group relative bouncy-tap ${selectedMode === GameMode.BATTLE_ROYALE ? 'border-[#2b6cb0] ring-4 ring-blue-500/10' : 'border-gray-100 dark:border-gray-800/80'}`}>
                <div className="absolute -top-2.5 right-4 bg-amber-500 text-[#1a365d] px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase">RECOMENDADO</div>
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 text-[#2b6cb0] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-xl select-none" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Battle Royale</h4>
                  <p className="text-[10px] text-gray-400 leading-tight">Supervivencia multijugador. El último en pie gana.</p>
                </div>
              </button>
              <button onClick={() => setSelectedMode(GameMode.COOP)} className={`p-5 bg-white dark:bg-[#1e293b] rounded-3xl text-left border-2 flex flex-col justify-between hover:border-[#2b6cb0] shadow-sm hover:shadow-md transition-all h-40 group bouncy-tap ${selectedMode === GameMode.COOP ? 'border-[#2b6cb0] ring-4 ring-blue-500/10' : 'border-gray-100 dark:border-gray-800/80'}`}>
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-xl select-none">handshake</span>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Estudio Cooperativo</h4>
                  <p className="text-[10px] text-gray-400 leading-tight">Forma equipo para resolver desafíos.</p>
                </div>
              </button>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-100/50 dark:bg-gray-800/40 p-5 rounded-3xl border border-gray-100 dark:border-gray-800/50 space-y-4">
              <div className="flex items-center gap-2 text-[#2b6cb0]">
                <Timer size={18} />
                <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Temporizador</h4>
              </div>
              <div className="flex gap-2">
                {[15, 30, 60].map((t) => (
                  <button key={t} type="button" onClick={() => setSelectedTimer(t)} className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all bouncy-tap ${selectedTimer === t ? 'bg-[#2b6cb0] text-white shadow-md' : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800'}`}>
                    {t}s
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-center text-gray-400 italic">Tiempo ideal por pregunta.</p>
            </div>

            <div className="bg-gray-100/50 dark:bg-gray-800/40 p-5 rounded-3xl border border-gray-100 dark:border-gray-800/50 space-y-3">
              <div className="flex items-center gap-2 text-[#2b6cb0]">
                <HelpCircle size={18} />
                <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Dificultad</h4>
              </div>
              <div className="space-y-2">
                {[
                  { key: Difficulty.EASY, label: 'Fácil', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' },
                  { key: Difficulty.NORMAL, label: 'Normal', color: 'text-[#2b6cb0] bg-blue-50 dark:bg-blue-950/20' },
                  { key: Difficulty.HARD, label: 'Difícil', color: 'text-red-500 bg-red-50 dark:bg-red-950/20' }
                ].map((d) => (
                  <div key={d.key} onClick={() => setSelectedDifficulty(d.key)} className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${selectedDifficulty === d.key ? 'border-[#2b6cb0] bg-white dark:bg-[#1e293b] shadow-sm' : 'border-transparent hover:border-gray-200 bg-white/40 dark:bg-[#1e293b]/20'}`}>
                    <div className="flex items-center gap-2">
                      <div className={'p-1.5 rounded-lg ' + d.color}>
                        <Star size={12} className="fill-current" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{d.label}</span>
                    </div>
                    <input type="radio" name="difficulty" checked={selectedDifficulty === d.key} onChange={() => setSelectedDifficulty(d.key)} className="text-[#2b6cb0] focus:ring-[#2b6cb0]" />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="flex justify-center pt-4">
            <button onClick={handleCreateRoom} className="w-full md:w-auto min-w-[280px] bg-amber-500 hover:bg-amber-600 text-[#1a365d] hover:text-white font-display font-extrabold py-4 px-8 rounded-full shadow-lg hover:shadow-xl transition-all bouncy-tap flex items-center justify-center gap-2 text-base leading-none">
              Crear Sala y Jugar <Play size={18} className="fill-current" />
            </button>
          </div>
          
          {generationError && (
             <div className="bg-red-100 text-red-600 p-3 rounded-xl text-center text-sm font-bold mt-4">
                {generationError}
             </div>
          )}
        </motion.div>
      )}

      {/* ----------------- STAGE 3: LOBBY / WAITING ROOM ----------------- */}
      {currentScreen === AppScreen.PLAY_LOBBY && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <button onClick={() => setCurrentScreen(AppScreen.PLAY_CONFIG)} className="text-[#2b6cb0] hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-full transition-colors active:scale-95">
              <ArrowLeft size={18} />
            </button>
            <h2 className="font-display font-extrabold text-lg text-gray-800 dark:text-white">Lobby de Espera</h2>
            <div className="w-10 h-10" />
          </div>

          <section className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col items-center">
            <span className="text-gray-400 dark:text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Código de Sala</span>
            <div className="font-display font-extrabold text-3xl md:text-4xl text-[#2b6cb0] bg-blue-50 dark:bg-blue-900/20 px-8 py-3 rounded-2xl tracking-[0.2em] mb-4 shadow-inner">
              {roomCode || 'Cargando...'}
            </div>
            <button onClick={handleCopyLink} className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-[#2b6cb0] font-bold text-xs px-5 py-2.5 rounded-xl transition-all bouncy-tap border border-gray-100 dark:border-gray-700">
              {copySuccess ? <Check size={14} className="stroke-[3]" /> : <Copy size={14} />}
              <span>{copySuccess ? '¡Enlace Copiado!' : 'Copiar Enlace'}</span>
            </button>
          </section>

          <div className="flex justify-between items-end px-1">
            <div className="space-y-1">
              <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white">Sala de Espera ({currentRoom?.roomCode})</h3>
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2b6cb0] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#2b6cb0]"></span>
                </span>
                <p className="text-gray-400 dark:text-gray-500 text-xs font-bold uppercase animate-pulse">Esperando a más jugadores...</p>
              </div>
            </div>
            <div className="text-right flex items-baseline gap-1">
              <span className="font-mono text-2xl font-black text-[#2b6cb0]">{lobbyPlayers.length}</span>
              <span className="font-mono text-base font-black text-gray-400">/10</span>
              <p className="text-gray-400 text-[10px] font-bold uppercase ml-1">Jugadores</p>
            </div>
          </div>

          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {lobbyPlayers.map((player) => (
              <div key={player.socketId || player.username} className={`bg-white dark:bg-[#1e293b] p-4 rounded-3xl shadow-sm flex flex-col items-center relative bouncy-hover ${player.isHost ? 'border-2 border-[#2b6cb0]' : 'border border-gray-100 dark:border-gray-800/80'}`}>
                {player.isHost && (
                  <div className="absolute -top-3 bg-[#2b6cb0] text-white px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight">Anfitrión</div>
                )}
                <div className={'w-16 h-16 rounded-full mb-3 overflow-hidden bg-gray-50 dark:bg-gray-800 ' + (player.isHost ? 'border-4 border-blue-100' : '')}>
                  <img className="w-full h-full object-cover" alt={player.username} src={cosmetics.find(c => c.id === player.avatarId)?.image || 'https://via.placeholder.com/150'} />
                </div>
                <span className="font-sans font-bold text-sm text-gray-800 dark:text-white truncate w-full text-center">{player.username}</span>
                <div className="mt-2 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  {player.isReady ? (
                    <> <CheckCircle size={14} className="fill-current text-white dark:text-transparent" /> <span className="text-[10px] font-black uppercase">Listo</span> </>
                  ) : (
                    <> <Timer size={14} className="text-gray-400" /> <span className="text-[10px] font-black uppercase text-gray-400">Esperando</span> </>
                  )}
                </div>
              </div>
            ))}
          </section>

          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleStartGameAsHost}
              disabled={currentRoom?.hostUsername !== user.username}
              className="w-full max-w-sm bg-amber-500 hover:bg-amber-600 text-[#1a365d] hover:text-white font-display font-extrabold py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all bouncy-tap flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              <Play size={16} className="fill-current" /> Comenzar Partida
            </button>
            {currentRoom?.hostUsername !== user.username && (
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider text-center max-w-xs px-4">Solo el anfitrión puede iniciar.</p>
            )}
          </div>
          
          {generationError && (
             <div className="bg-red-100 text-red-600 p-3 rounded-xl text-center text-sm font-bold mt-4">
                {generationError}
             </div>
          )}
        </motion.div>
      )}

      {/* ----------------- STAGE 4: TRIVIA GAMEPLAY ----------------- */}
      {currentScreen === AppScreen.PLAY_GAME && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <button onClick={handleResetFlow} className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Trash2 size={18} />
            </button>
            <div className="flex flex-col items-center text-center">
              <span className="text-[#2b6cb0] font-sans text-[10px] font-bold uppercase tracking-wider">Trivia</span>
              <h2 className="font-display font-extrabold text-sm text-gray-800 dark:text-white">
                Pregunta {currentQuestionIndex + 1} de {questions.length}
              </h2>
            </div>
            <div className="w-10 h-10" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-9 bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
              <div className="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative shadow-inner">
                <div className="h-full bg-[#2b6cb0] rounded-full relative transition-all duration-300" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}>
                  <div className="absolute inset-0 progress-bar-shine bg-white/20" />
                </div>
              </div>
            </div>
            <div className="md:col-span-3 flex justify-center md:justify-end">
              <div className={`px-5 py-2.5 rounded-2xl flex items-center gap-2 border-2 shadow-md timer-glow-pulse ${gameCountdown <= 5 ? 'bg-red-50 dark:bg-red-950/20 text-red-500 border-red-500' : 'bg-amber-100 text-[#1a365d] border-amber-400 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'}`}>
                <Timer size={16} />
                <span className="font-mono font-black text-lg">{gameCountdown}s</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#1e293b] p-8 md:p-12 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800/80 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none select-none text-gray-400"><HelpCircle size={120} /></div>
            <h3 className="font-display font-extrabold text-lg md:text-2xl text-gray-800 dark:text-white relative z-10 leading-snug">
              {questions[currentQuestionIndex].question}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['A', 'B', 'C', 'D'] as const).map((key) => {
              const activeQuestion = questions[currentQuestionIndex];
              const label = activeQuestion.options[key];
              const isSelected = selectedAnswer === key; // La que el usuario seleccionó
              const isCorrectOption = key === resolvedCorrectAnswer; // La correcta según el servidor

              let optionStyle = 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e293b] hover:border-blue-400 dark:hover:border-blue-700';
              if (resolvedCorrectAnswer) { // Usar el estado de resolución para colorear
                if (isCorrectOption) {
                  optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 ring-2 ring-emerald-500/20 scale-105';
                } else if (isSelected) {
                  optionStyle = 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300 ring-2 ring-red-500/20';
                } else {
                  optionStyle = 'opacity-40 border-gray-100 dark:border-gray-800/40 bg-white dark:bg-[#1e293b]';
                }
              } else if (isSelected) {
                // [MEJORA] Estilo de selección más prominente antes de que se resuelva la pregunta.
                optionStyle = 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/20';
              }

              return (
                <button
                  key={key}
                  // [CORRECCIÓN] El botón se deshabilita si el jugador ya eligió (selectedAnswer) o si el servidor resolvió (answerFrozen)
                  disabled={selectedAnswer !== null || answerFrozen}
                  onClick={() => handleAnswerSelect(key)}
                  className={`answer-card p-5 rounded-2xl border-2 font-semibold text-sm md:text-base flex items-center gap-4 text-left transition-all duration-300 ${optionStyle}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-black text-sm flex-shrink-0 transition-colors ${resolvedCorrectAnswer ? (isCorrectOption ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : 'bg-gray-100 dark:bg-gray-800 text-[#2b6cb0] group-hover:bg-[#2b6cb0] group-hover:text-white'}`}>
                    {key}
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 leading-tight">{label}</span>
                </button>
              );
            })}
          </div>

          <footer className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/20 px-4 py-2 rounded-full">
                  <Flame className="w-4 h-4 text-red-500 fill-red-500" />
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">Racha: {playerStats.streak}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/20 px-4 py-2 rounded-full">
                  <span className="material-symbols-outlined text-amber-500 text-base material-symbols-fill select-none">monetization_on</span>
                  <span className="text-xs font-bold text-[#2b6cb0]">{playerStats.score} pts</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Lobby Pos:</span>
                {myRank > 0 && <div className="flex -space-x-1">
                  <img className="w-6 h-6 rounded-full border border-white" src={activeAvatarImage} alt="Tú" />
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-[#1a365d] text-[10px] font-black flex items-center justify-center border border-white">{myRank}º</div>
                </div>}
              </div>
            </div>
          </footer>
        </motion.div>
      )}

      {/* ----------------- STAGE 5: GAME OVER / RESULT PODIUM ----------------- */}
      {currentScreen === AppScreen.PLAY_GAMEOVER && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-8">
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="absolute w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: ['#2b6cb0', '#ecc94b', '#48bb78', '#f56565', '#805ad5'][i % 5], left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, opacity: Math.random() * 0.7, animationDelay: `${Math.random() * 5}s`, animationDuration: `${Math.random() * 3 + 2}s` }} />
            ))}
          </div>

          <div className="text-center space-y-2 relative z-10">
            <h2 className="font-display font-extrabold text-4xl text-[#005394] dark:text-[#a2c9ff] tracking-tight">¡Final de la Partida!</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto leading-relaxed">Gran esfuerzo de todos los estudiantes. ¡Mira el podio y tus estadísticas!</p>
          </div>

          <div className="flex items-end justify-center gap-4 relative h-[280px] bg-white dark:bg-[#1e293b]/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/80 shadow-sm overflow-hidden pt-12 max-w-lg mx-auto">
            {/* 2nd Place */}
            {secondPlace && <div className="flex flex-col items-center w-1/3">
              <div className="relative mb-2">
                <div className="w-14 h-14 rounded-full border-2 border-gray-300 overflow-hidden bg-gray-50 shadow-md">
                  <img className="w-full h-full object-cover" src={cosmetics.find(c => c.id === secondPlace.avatarId)?.image || 'https://via.placeholder.com/150'} alt="2nd Place" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-gray-300 text-gray-800 rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">2</div>
              </div>
              <span className="font-sans font-bold text-[11px] text-gray-700 dark:text-gray-300 truncate w-full text-center">{secondPlace.username}</span>
              <span className="text-[10px] text-gray-400 font-semibold">{secondPlace.score} pts</span>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-t-xl h-20 mt-2 border-t-2 border-gray-300" />
            </div>}

            {/* 1st Place */}
            {firstPlace && <div className="flex flex-col items-center w-1/3">
              <div className="relative mb-2">
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-amber-500 fill-amber-500 animate-bounce"><Trophy size={28} className="fill-current" /></div>
                <div className="w-18 h-14 rounded-full border-4 border-amber-400 overflow-hidden bg-gray-50 shadow-xl ring-4 ring-amber-300/30">
                  <img className="w-full h-full object-cover" src={cosmetics.find(c => c.id === firstPlace.avatarId)?.image || 'https://via.placeholder.com/150'} alt="1st Place" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-amber-400 text-[#1a365d] rounded-full w-7 h-7 flex items-center justify-center font-black text-sm border border-amber-100 shadow-md">1</div>
              </div>
              <span className="font-sans font-bold text-xs text-gray-800 dark:text-white truncate w-full text-center">{firstPlace.username}</span>
              <span className="text-[10px] text-amber-600 font-bold">{firstPlace.score} pts</span>
              <div className="w-full bg-amber-100 dark:bg-amber-950/20 rounded-t-xl h-28 mt-2 border-t-2 border-amber-400 shadow-sm" />
            </div>}

            {/* 3rd Place */}
            {thirdPlace && <div className="flex flex-col items-center w-1/3">
              <div className="relative mb-2">
                <div className="w-12 h-12 rounded-full border-2 border-amber-600 overflow-hidden bg-gray-50 shadow-md">
                  <img className="w-full h-full object-cover" src={cosmetics.find(c => c.id === thirdPlace.avatarId)?.image || 'https://via.placeholder.com/150'} alt="3rd Place" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-amber-700 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-[10px]">3</div>
              </div>
              <span className="font-sans font-bold text-[11px] text-gray-700 dark:text-gray-300 truncate w-full text-center">{thirdPlace.username}</span>
              <span className="text-[10px] text-gray-400 font-semibold">{thirdPlace.score} pts</span>
              <div className="w-full bg-orange-100/50 dark:bg-orange-950/10 rounded-t-xl h-16 mt-2 border-t-2 border-amber-700" />
            </div>}
          </div>

          <section className="bg-white dark:bg-[#1e293b] rounded-3xl p-5 shadow-md border border-gray-100 dark:border-gray-800/80 max-w-lg mx-auto space-y-4">
            <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white text-center">Tus Estadísticas</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl flex flex-col items-center text-center">
                <CheckCircle className="w-4 h-4 text-emerald-600 mb-1" />
                <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Aciertos</p>
                <p className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{playerStats.correct}/{questions.length}</p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl flex flex-col items-center text-center">
                <span className="material-symbols-outlined text-amber-500 text-base material-symbols-fill select-none mb-1">monetization_on</span>
                <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Puntos</p>
                <p className="font-mono text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{playerStats.score}</p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl flex flex-col items-center text-center">
                <Sparkles className="w-4 h-4 text-[#2b6cb0] mb-1" />
                <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">XP Ganada</p>
                <div className="flex flex-col items-center">
                  <p className="font-mono text-xl font-black text-[#2b6cb0] mt-1">
                    +{playerStats.correct * 15 * (user.isPremium ? 2 : 1)}
                  </p>
                  <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: '75%' }} />
                  </div>
                  <p className="text-[8px] font-black text-[#2b6cb0] mt-0.5">LVL {user.level} → LVL {user.level + (user.xp + playerStats.correct * 15 * (user.isPremium ? 2 : 1) >= user.maxXp ? 1 : 0)}</p>
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mx-auto pt-4 relative z-10">
            <button onClick={handleResetFlow} className="flex-1 bg-amber-500 hover:bg-amber-600 text-[#1a365d] hover:text-white font-display font-extrabold py-3.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all bouncy-tap flex items-center justify-center gap-1.5 text-sm">
              <RotateCcw size={16} /> Jugar de Nuevo
            </button>
            <button onClick={() => onNavigate(AppScreen.HOME)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-display font-extrabold py-3.5 px-4 rounded-xl shadow-sm transition-all bouncy-tap flex items-center justify-center gap-1.5 text-sm">
              <LayoutDashboard size={16} /> Panel Principal
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}