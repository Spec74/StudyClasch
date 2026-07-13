import { useState, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppScreen, UserProfile, GameMode, Difficulty, CosmeticItem } from '../types'; // Tipos específicos del frontend
import { TriviaQuestion, RoomRecord, RoomPlayer } from '../../server/types.js'; // Tipos compartidos con el backend
import { HISTORY_QUESTIONS, MARKETING_QUESTIONS } from '../data'; // LOBBY_PLAYERS ya no se usará directamente
import { 
  ArrowLeft, FileUp, Sparkles, AlertCircle, CheckCircle, 
  Trash2, ArrowRight, Play, Users, Copy, Check, Timer, 
  HelpCircle, Trophy, RotateCcw, LayoutDashboard, Star, Lock, Flame
} from 'lucide-react';
import io from 'socket.io-client'; // Importar Socket.IO Client

interface PlayViewProps {
  user: UserProfile;
  activeAvatarImage: string;
  onOpenPremium: () => void;
  onNavigate: (screen: AppScreen) => void;
  onCompleteGame: (correct: number, points: number, xp: number, coins: number) => void;
  cosmetics: CosmeticItem[]; // Add cosmetics prop
  currentScreen: AppScreen;
  setCurrentScreen: (screen: AppScreen) => void;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4001';

export default function PlayView({
  user,
  activeAvatarImage,
  onOpenPremium,
  onNavigate,
  onCompleteGame,
  currentScreen,
  setCurrentScreen,
  cosmetics // Destructure cosmetics
}: PlayViewProps) {
  // --- Upload State ---
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string; category?: 'history' | 'marketing'; source: 'upload' | 'sample' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // --- Match Config State ---
  const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.BATTLE_ROYALE);
  const [selectedTimer, setSelectedTimer] = useState<number>(30); // 15s, 30s, 60s
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.NORMAL);

  // --- Lobby State ---
  const [copySuccess, setCopySuccess] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<RoomRecord | null>(null); // Estado para la sala actual
  const [lobbyPlayers, setLobbyPlayers] = useState<RoomPlayer[]>([]); // Estado para los jugadores del lobby
  const [roomCode, setRoomCode] = useState<string>(''); // Nuevo estado para el código de sala

  // --- Quiz Engine State ---
  const [questions, setQuestions] = useState<TriviaQuestion[]>(HISTORY_QUESTIONS);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [gameCountdown, setGameCountdown] = useState(30);
  const [selectedAnswer, setSelectedAnswer] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [answerFrozen, setAnswerFrozen] = useState(false);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  const [gameStreak, setGameStreak] = useState(0);
  const [gamePoints, setGamePoints] = useState(0);

  // --- Simulated Upload Handler ---
  const handleSelectPredefinedFile = (category: 'history' | 'marketing') => {
    setIsUploading(true);
    setUploadProgress(0);
    setGenerationError(null);
    const fileName = category === 'history' 
      ? 'Apuntes_Historia_Moderna.pdf' 
      : 'Fundamentos_Marketing_TEMA3.pdf';
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
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4001';
    const pdfBase64 = await readFileAsBase64(file);

    const response = await fetch(`${apiBaseUrl}/api/quizzes/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: file.name,
        pdfBase64,
        email: user.email,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error ?? 'No se pudo generar el quiz desde el backend.');
    }

    const normalizedQuestions = Array.isArray(payload?.quiz?.questions)
      ? payload.quiz.questions
      : Array.isArray(payload?.questions)
      ? payload.questions
      : [];

    if (normalizedQuestions.length === 0) {
      throw new Error('El backend no devolvió preguntas válidas.');
    }

    return normalizedQuestions;
  };

  const handleCustomFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        alert('Por favor, selecciona solo archivos en formato PDF.');
        return;
      }

      setGenerationError(null);
      setIsGeneratingQuestions(false);
      setIsUploading(true);
      setUploadProgress(0);

      const startProcessing = async () => {
        let aiQuestions: TriviaQuestion[] = []; // Declarar aiQuestions aquí
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

          aiQuestions = await generateQuestionsFromPdf(file); // Asignar a la variable declarada
          // Las preguntas se establecen localmente, pero también deben enviarse al backend para persistencia
          setQuestions(aiQuestions);
        } catch (error) {
          console.error('Error generating questions from PDF:', error);
          setGenerationError(
            error instanceof Error
              ? error.message
              : 'No se pudieron generar preguntas desde el PDF.',
          );
          setQuestions(HISTORY_QUESTIONS);
        } finally {
          setIsGeneratingQuestions(false);
        }

        // The room creation logic has been moved to handleCreateRoom
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

  // Socket.IO instance (moved outside useEffect for broader access)
  const [socket, setSocket] = useState<ReturnType<typeof io> | null>(null);

  // Initialize socket once when component mounts
  useEffect(() => {
    const newSocket = io(apiBaseUrl);
    setSocket(newSocket);
    return () => {
      newSocket.disconnect();
    };
  }, []); // Empty dependency array means this runs once on mount

  // --- Socket.IO Client Logic ---
  useEffect(() => {
    if (!socket || currentScreen !== AppScreen.PLAY_LOBBY || !roomCode || !user) {
      return;
    }

      console.log(`[Frontend Socket] Intentando conectar a Socket.IO en: ${apiBaseUrl}`);

      // Define the join room logic
      const joinRoom = () => {
        console.log(`[Frontend Socket] Uniéndose a la sala ${roomCode}`);
        socket.emit('room:join', {
          roomCode,
          username: user.username,
          avatarId: user.avatarId,
          email: user.email,
        });
      };

      const onRoomState = (data: RoomRecord) => { // Expecting RoomRecord directly
        console.log('[Frontend Socket] room:state recibido:', data);
        setCurrentRoom(data);
        setRoomCode(data.roomCode); // Ensure roomCode state is updated from the server
        setLobbyPlayers(data.players); // Update the list of players
      };

      const onRoomStarted = (data: { roomCode: string; status: 'lobby' | 'live' | 'finished'; questions: TriviaQuestion[] }) => {
        console.log('[Frontend Socket] room:started recibido:', data);
        // Update room status and questions, then start the game
        setCurrentRoom(prev => prev ? { ...prev, status: data.status, questions: data.questions } : null);
        setQuestions(data.questions); // Set the questions for the game
        handleStartQuiz(); // Transition to game screen
      };

          const onRoomError = (data: { message: string }) => {
        console.error('[Frontend Socket] Error de sala:', data.message);
        setGenerationError(data.message);
      };

      const onRoomFinished = (data: { leaderboard: Array<{ username: string; score: number; correct: number; answered: number }>; winner: string | null }) => {
        console.log('[Frontend Socket] room:finished recibido:', data);
        setCurrentScreen(AppScreen.PLAY_GAMEOVER);
      };

      const onPlayerUpdate = (update: { username: string; score: number; correct: number; answered: number; total: number }) => {
        console.log('[Frontend Socket] game:player:update recibido:', update);
      };

      const onDisconnect = () => {
        console.log('[Frontend Socket] Desconectado del servidor.');
      };

      // Attach event listeners
      socket.on('room:state', onRoomState);
      socket.on('room:started', onRoomStarted); // New event for game start
      socket.on('game:player:update', onPlayerUpdate);
      socket.on('room:finished', onRoomFinished);
      socket.on('roomError', onRoomError);
      socket.on('disconnect', onDisconnect);

      // Handle joining the room
      if (socket.connected) {
        joinRoom();
      } else {
        socket.once('connect', joinRoom);
      }

      // Limpiar la conexión del socket cuando el componente se desmonte o la pantalla cambie
      return () => {
        socket?.off('room:state', onRoomState);
        socket?.off('room:started', onRoomStarted);
        socket?.off('game:player:update', onPlayerUpdate);
        socket?.off('room:finished', onRoomFinished);
        socket?.off('roomError', onRoomError);
        socket?.off('disconnect', onDisconnect);
        socket?.off('connect', joinRoom); // Clean up the 'once' listener too
      };
  }, [currentScreen, roomCode, user, socket, onNavigate]); // Add socket to dependencies

  // --- Lógica para crear la sala (movida de handleCustomFileUpload) ---
  const handleCreateRoom = async () => {
    setGenerationError(null); // Limpiar errores previos

    if (questions.length === 0) {
      setGenerationError('No hay preguntas para crear la sala. Por favor, sube un PDF o selecciona un ejemplo.');
      return;
    }

    console.log('DEBUG: User object in handleCreateRoom:', user);
    console.log('DEBUG: Questions array length in handleCreateRoom:', questions.length);

    try {
      // Endpoint para crear salas
      const createRoomResponse = await fetch(`${apiBaseUrl}/api/rooms`, { // Changed to /api/rooms for RESTful consistency
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hostUsername: user.username, // Usar hostUsername como se define en RoomRecord
          hostEmail: user.email, // Enviar email del host
          hostAvatarId: user.avatarId, // Enviar avatarId del host
          questions: questions,
          mode: selectedMode, // Usar 'mode' como se define en RoomRecord
          timer: selectedTimer,
          difficulty: selectedDifficulty,
          fileName: selectedFile?.name || 'Untitled.pdf', // Proporcionar un nombre de archivo predeterminado o real
          prompt: 'Generated from PDF', // Proporcionar un prompt predeterminado o real
        }),
      });

      const roomPayload = await createRoomResponse.json().catch(() => ({}));

      if (!createRoomResponse.ok) {
        throw new Error(roomPayload?.error ?? 'No se pudo crear la sala en el backend.');
      }

      setRoomCode(roomPayload.room.roomCode); // Establecer el estado roomCode
      setCurrentRoom(roomPayload.room); // Establecer el objeto de sala actual
      console.log('Sala creada con código:', roomPayload.room.roomCode);
      setCurrentScreen(AppScreen.PLAY_LOBBY); // Navegar al lobby DESPUÉS de que la sala sea creada
    } catch (roomError) {
      console.error('Error al crear la sala:', roomError);
      setGenerationError(roomError instanceof Error ? roomError.message : 'Ocurrió un error al crear la sala.');
    }
  };

  // --- Copy Room Link ---
  const handleCopyLink = async () => {
    navigator.clipboard.writeText(`https://studyclash.app/room/${roomCode}`); // Usar el roomCode dinámico
    setCopySuccess(true);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Use async/await for better control
  };

  // --- Start Quiz Gameplay ---
  const handleStartGameAsHost = () => {
    if (!socket) {
      setGenerationError('No hay conexión de sala. Recarga la página y vuelve a intentarlo.');
      return;
    }

    if (!roomCode) {
      setGenerationError('No hay un código de sala válido. Crea una sala antes de iniciar.');
      return;
    }

    if (currentRoom?.hostUsername !== user.username) {
      setGenerationError('Solo el anfitrión puede iniciar la partida.');
      return;
    }

    socket.emit('room:start', { roomCode });
  };
  const handleStartQuiz = () => {
    setCurrentQuestionIndex(0);
    setGameCountdown(selectedTimer);
    setSelectedAnswer(null);
    setAnswerFrozen(false);
    setCorrectAnswersCount(0);
    setGameStreak(0);
    setGamePoints(0);
    setCurrentScreen(AppScreen.PLAY_GAME);
  };

  // --- Trivia Countdown Timer ---
  useEffect(() => {
    if (currentScreen !== AppScreen.PLAY_GAME || answerFrozen) return; // Stop timer if answer is frozen

    const timer = setInterval(() => {
      setGameCountdown((prev) => {
        if (prev <= 1) {
          // Time run out: auto mark wrong and advance
          handleAnswerSelect(null);
          return selectedTimer;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentScreen, currentQuestionIndex, answerFrozen, selectedTimer]); // Add answerFrozen to dependencies

  // --- Handle Trivia Option Clicks ---
  const handleAnswerSelect = (option: 'A' | 'B' | 'C' | 'D' | null) => {
    if (answerFrozen) return;
    
    setSelectedAnswer(option);
    setAnswerFrozen(true);

    const activeQuestion = questions[currentQuestionIndex];
    const isCorrect = option === activeQuestion.correctOption;

    if (socket && roomCode) {
      socket.emit('game:answer', {
        roomCode,
        username: user.username,
        questionId: activeQuestion.id,
        answer: option,
        timeRemaining: gameCountdown,
      });
    }

    if (isCorrect) {
      setCorrectAnswersCount(prev => prev + 1);
      setGameStreak(prev => prev + 1);
      // Award base points + streak bonus + fast answering bonus
      const speedBonus = Math.round((gameCountdown / selectedTimer) * 200);
      const pointsEarned = 1000 + (gameStreak * 100) + speedBonus;
      setGamePoints(prev => prev + pointsEarned);
    } else {
      setGameStreak(0);
    }

    // Auto advance after short delay
    setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setGameCountdown(selectedTimer);
        setSelectedAnswer(null);
        setAnswerFrozen(false);
      } else {
        // Game completed: award coins, xp, points to global profile
        // Base coin reward: correct answers * 10
        // Base XP reward: correct answers * 15
        const gainedCoins = correctAnswersCount * 10 + (user.isPremium ? 20 : 0);
        const gainedXp = correctAnswersCount * 15 * (user.isPremium ? 2 : 1);
        
        onCompleteGame(correctAnswersCount, gamePoints, gainedXp, gainedCoins);
        setCurrentScreen(AppScreen.PLAY_GAMEOVER);
      }
    }, 1500);
  };

  // --- Reset/Restart Flow ---
  const handleResetFlow = () => {
    setSelectedFile(null);
    setSelectedMode(GameMode.BATTLE_ROYALE);
    setSelectedTimer(30);
    setSelectedDifficulty(Difficulty.NORMAL);
    setCurrentScreen(AppScreen.PLAY_UPLOAD);
  };

  // --- Dynamic calculations for final podium ranking ---
  // If score is high, player ranks 1st, else 2nd or 3rd
  const playerRank = correctAnswersCount >= 9 
    ? 1 
    : correctAnswersCount >= 6 
    ? 2 
    : 3;

  const firstPlacePlayer = playerRank === 1 ? user.username : 'Lucia_Master';
  const secondPlacePlayer = playerRank === 2 ? user.username : (playerRank === 1 ? 'Lucia_Master' : 'Carlos_M'); // If user is 1st, Lucia is 2nd
  const thirdPlacePlayer = playerRank === 3 ? user.username : (playerRank === 1 ? 'Carlos_M' : 'Alex_Dev'); // If user is 1st, Carlos's score is 8450

  const firstPlaceScore = playerRank === 1 ? gamePoints : 9200;
  const secondPlaceScore = playerRank === 2 ? gamePoints : (playerRank === 1 ? 9200 : 8450); // If user is 1st, Lucia's score is 9200
  const thirdPlaceScore = playerRank === 3 ? gamePoints : (playerRank === 1 ? 8450 : 7100); // If user is 1st, Carlos's score is 8450

  return (
    <div className="w-full max-w-2xl mx-auto pb-12 relative">
      {/* ----------------- STAGE 1: UPLOAD PDF ----------------- */}
      {currentScreen === AppScreen.PLAY_UPLOAD && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => onNavigate(AppScreen.HOME)}
                className="text-[#2b6cb0] hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-full transition-colors active:scale-95"
              >
                <ArrowLeft size={18} />
              </button>
              <h2 className="font-display font-extrabold text-lg text-gray-800 dark:text-white">Crear Sala</h2>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full text-xs font-bold text-[#2b6cb0]">
              LVL {user.level}
            </div>
          </div>

          {/* Step Indicator */}
          <div className="bg-white dark:bg-[#1e293b] p-5 rounded-3xl border border-gray-100 dark:border-gray-800/80 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 dark:bg-blue-900/40 text-[#2b6cb0] text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-wide">
                Paso 1
              </span>
              <p className="font-display font-extrabold text-base text-gray-800 dark:text-white">Sube tu PDF de clase</p>
            </div>
            {/* Progress line */}
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="w-1/3 h-full bg-[#2b6cb0] rounded-full" />
            </div>
          </div>

          {/* Core Upload Canvas */}
          {!selectedFile ? (
            <div className="space-y-6">
              {/* Drop area */}
              <div 
                onClick={() => document.getElementById('pdf-file-picker')?.click()}
                className={`relative group cursor-pointer w-full aspect-[2/1] md:aspect-[5/2] bg-white dark:bg-[#1e293b] border-4 border-dashed rounded-[2rem] flex flex-col items-center justify-center p-6 text-center transition-all duration-300 ${
                  isUploading 
                    ? 'border-[#2b6cb0] bg-blue-50/10' 
                    : 'border-gray-200 dark:border-gray-800 hover:border-[#2b6cb0] hover:bg-blue-50/5'
                }`}
              >
                <input 
                  type="file" 
                  id="pdf-file-picker" 
                  accept=".pdf" 
                  onChange={handleCustomFileUpload} 
                  className="hidden" 
                />

                {isUploading || isGeneratingQuestions ? (
                  <div className="space-y-3">
                    {/* Pulsing loading state */}
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto animate-bounce">
                      <FileUp size={32} className="text-[#2b6cb0]" />
                    </div>
                    <p className="font-bold text-gray-800 dark:text-white">
                      {isGeneratingQuestions ? 'Gemini está creando tu cuestionario...' : 'Procesando apuntes en la nube...'}
                    </p>
                    <div className="w-48 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mx-auto overflow-hidden">
                      <div className="h-full bg-[#2b6cb0] transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                      <FileUp size={28} className="text-[#2b6cb0]" />
                    </div>
                    <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white mb-1">
                      Toca para subir tu PDF de clase
                    </h3>
                    <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                      Arrastra o selecciona el archivo para comenzar la aventura. Máx. 10MB • Solo formato PDF
                    </p>
                  </>
                )}
              </div>

              {/* Predefined Sample PDFs (Extremely useful for demoing) */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-1 block">
                  O prueba con apuntes de ejemplo rápidos:
                </span>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleSelectPredefinedFile('history')}
                    className="p-4 bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-gray-800/80 rounded-2xl hover:border-blue-400 text-left transition-all bouncy-tap shadow-sm"
                  >
                    <h4 className="font-bold text-xs text-gray-800 dark:text-white mb-0.5 truncate">Apuntes de Historia</h4>
                    <p className="text-[10px] text-gray-400">Revolución Francesa y más • 2.4 MB</p>
                  </button>

                  <button
                    onClick={() => handleSelectPredefinedFile('marketing')}
                    className="p-4 bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-gray-800/80 rounded-2xl hover:border-blue-400 text-left transition-all bouncy-tap shadow-sm"
                  >
                    <h4 className="font-bold text-xs text-gray-800 dark:text-white mb-0.5 truncate">Fundamentos de Marketing</h4>
                    <p className="text-[10px] text-gray-400">Las 4 Ps, FODA y más • 1.8 MB</p>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Loaded State Card */}
              <div className="relative bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-md border border-emerald-500/20 text-center animate-pulse">
                {/* Unlocked / loaded indicator */}
                <div className="absolute top-4 right-4 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  <CheckCircle size={14} className="fill-current text-white dark:text-transparent" />
                  <span>Archivo cargado</span>
                </div>

                <div className="w-16 h-16 bg-red-50 dark:bg-red-950/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-red-500 text-4xl select-none">picture_as_pdf</span>
                </div>

                <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white mb-1 truncate px-4">
                  {selectedFile.name}
                </h3>
                <p className="text-xs text-gray-400">
                  {selectedFile.size} • {isGeneratingQuestions ? 'Analizando el PDF con Gemini' : 'Listo para jugar'}
                </p>
              </div>

              {generationError && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4 rounded-2xl text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  {generationError} Se usará el banco de preguntas de respaldo para seguir probando el juego.
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => setCurrentScreen(AppScreen.PLAY_CONFIG)}
                  disabled={isGeneratingQuestions}
                  className="w-full bg-[#2b6cb0] hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all bouncy-tap"
                >
                  {isGeneratingQuestions ? 'Generando con Gemini...' : 'Ir a Configuración'}
                  <ArrowRight size={16} />
                </button>

                <button
                  onClick={handleRemoveFile}
                  className="w-full bg-red-50 dark:bg-red-950/20 hover:bg-red-100 text-red-600 dark:text-red-400 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trash2 size={14} /> Eliminar y cambiar archivo
                </button>
              </div>
            </div>
          )}

          {/* Help Info Box */}
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
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setCurrentScreen(AppScreen.PLAY_UPLOAD)}
                className="text-[#2b6cb0] hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-full transition-colors active:scale-95"
              >
                <ArrowLeft size={18} />
              </button>
              <h2 className="font-display font-extrabold text-lg text-gray-800 dark:text-white">Configurar Partida</h2>
            </div>
            <div className="bg-[#2b6cb0] text-white px-3 py-1 rounded-full text-xs font-bold">
              LVL {user.level}
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="bg-white dark:bg-[#1e293b] p-5 rounded-3xl border border-gray-100 dark:border-gray-800/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-sans text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block">
                Paso 2: CONFIGURA TU PARTIDA
              </span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">60% Completado</span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="w-3/5 h-full bg-[#2b6cb0] rounded-full shadow-sm" />
            </div>
          </div>

          {/* Game Mode Select */}
          <section className="space-y-3">
            <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white pl-1">
              Selecciona el Modo de Juego
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1v1 Duel */}
              <button
                onClick={() => setSelectedMode(GameMode.DUEL_1V1)}
                className={`p-5 bg-white dark:bg-[#1e293b] rounded-3xl text-left border-2 flex flex-col justify-between hover:border-[#2b6cb0] shadow-sm hover:shadow-md transition-all h-40 group bouncy-tap ${
                  selectedMode === GameMode.DUEL_1V1 ? 'border-[#2b6cb0] ring-4 ring-blue-500/10' : 'border-gray-100 dark:border-gray-800/80'
                }`}
              >
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/20 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-xl select-none" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Duelo 1v1</h4>
                  <p className="text-[10px] text-gray-400 leading-tight">Competencia rápida cara a cara con otro estudiante.</p>
                </div>
              </button>

              {/* Battle Royale */}
              <button
                onClick={() => setSelectedMode(GameMode.BATTLE_ROYALE)}
                className={`p-5 bg-white dark:bg-[#1e293b] rounded-3xl text-left border-2 flex flex-col justify-between hover:border-[#2b6cb0] shadow-sm hover:shadow-md transition-all h-40 group relative bouncy-tap ${
                  selectedMode === GameMode.BATTLE_ROYALE ? 'border-[#2b6cb0] ring-4 ring-blue-500/10' : 'border-gray-100 dark:border-gray-800/80'
                }`}
              >
                <div className="absolute -top-2.5 right-4 bg-amber-500 text-[#1a365d] px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase">
                  RECOMENDADO
                </div>
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 text-[#2b6cb0] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-xl select-none" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Battle Royale</h4>
                  <p className="text-[10px] text-gray-400 leading-tight">Supervivencia multijugador. El último en pie gana.</p>
                </div>
              </button>

              {/* Co-Op Study */}
              <button
                onClick={() => setSelectedMode(GameMode.COOP)}
                className={`p-5 bg-white dark:bg-[#1e293b] rounded-3xl text-left border-2 flex flex-col justify-between hover:border-[#2b6cb0] shadow-sm hover:shadow-md transition-all h-40 group bouncy-tap ${
                  selectedMode === GameMode.COOP ? 'border-[#2b6cb0] ring-4 ring-blue-500/10' : 'border-gray-100 dark:border-gray-800/80'
                }`}
              >
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-xl select-none">handshake</span>
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Estudio Cooperativo</h4>
                  <p className="text-[10px] text-gray-400 leading-tight">Forma equipo para resolver desafíos complejos juntos.</p>
                </div>
              </button>
            </div>
          </section>

          {/* Quick Settings Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Timer Picker */}
            <div className="bg-gray-100/50 dark:bg-gray-800/40 p-5 rounded-3xl border border-gray-100 dark:border-gray-800/50 space-y-4">
              <div className="flex items-center gap-2 text-[#2b6cb0]">
                <Timer size={18} />
                <h4 className="font-display font-bold text-sm text-gray-800 dark:text-white">Temporizador</h4>
              </div>
              <div className="flex gap-2">
                {[15, 30, 60].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTimer(t)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all bouncy-tap ${
                      selectedTimer === t
                        ? 'bg-[#2b6cb0] text-white shadow-md'
                        : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800'
                    }`}
                  >
                    {t}s
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-center text-gray-400 italic">
                Tiempo ideal por pregunta para mantener el ritmo alto.
              </p>
            </div>

            {/* Difficulty Picker */}
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
                  <div
                    key={d.key}
                    onClick={() => setSelectedDifficulty(d.key)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDifficulty === d.key
                        ? 'border-[#2b6cb0] bg-white dark:bg-[#1e293b] shadow-sm'
                        : 'border-transparent hover:border-gray-200 bg-white/40 dark:bg-[#1e293b]/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${d.color}`}>
                        <Star size={12} className="fill-current" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{d.label}</span>
                    </div>
                    <input
                      type="radio"
                      name="difficulty"
                      checked={selectedDifficulty === d.key}
                      onChange={() => setSelectedDifficulty(d.key)}
                      className="text-[#2b6cb0] focus:ring-[#2b6cb0]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Main CTA */}
          <div className="flex justify-center pt-4">
            <button
              onClick={handleCreateRoom} // Llamar a la nueva función handleCreateRoom
              className="w-full md:w-auto min-w-[280px] bg-amber-500 hover:bg-amber-600 text-[#1a365d] hover:text-white font-display font-extrabold py-4 px-8 rounded-full shadow-lg hover:shadow-xl transition-all bouncy-tap flex items-center justify-center gap-2 text-base leading-none"
            >
              Crear Sala y Jugar
              <Play size={18} className="fill-current" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ----------------- STAGE 3: LOBBY / WAITING ROOM ----------------- */}
      {currentScreen === AppScreen.PLAY_LOBBY && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <button 
              onClick={() => setCurrentScreen(AppScreen.PLAY_CONFIG)}
              className="text-[#2b6cb0] hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-full transition-colors active:scale-95"
            >
              <ArrowLeft size={18} />
            </button>
            <h2 className="font-display font-extrabold text-lg text-gray-800 dark:text-white">Lobby de Espera</h2>
            <div className="w-10 h-10" /> {/* balance spacer */}
          </div>

          {/* Room Code Card */}
          <section className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col items-center">
            <span className="text-gray-400 dark:text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Código de Sala</span>
            <div className="font-display font-extrabold text-3xl md:text-4xl text-[#2b6cb0] bg-blue-50 dark:bg-blue-900/20 px-8 py-3 rounded-2xl tracking-[0.2em] mb-4 shadow-inner">
              {roomCode || 'Cargando...'} {/* Mostrar el código de sala dinámico */}
            </div>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-[#2b6cb0] font-bold text-xs px-5 py-2.5 rounded-xl transition-all bouncy-tap border border-gray-100 dark:border-gray-700"
            >
              {copySuccess ? <Check size={14} className="stroke-[3]" /> : <Copy size={14} />}
              <span>{copySuccess ? '¡Enlace Copiado!' : 'Copiar Enlace'}</span>
            </button>
          </section>

          {/* Status & Player Count Info */}
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

          {/* Lobby Players Grid */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {lobbyPlayers.map((player) => (
              <div
                key={player.socketId || player.username} // Usar socketId como key si está disponible, sino username
                className={`bg-white dark:bg-[#1e293b] p-4 rounded-3xl shadow-sm flex flex-col items-center relative bouncy-hover ${
                  player.isHost ? 'border-2 border-[#2b6cb0]' : 'border border-gray-100 dark:border-gray-800/80'
                }`}
              >
                {player.isHost && (
                  <div className="absolute -top-3 bg-[#2b6cb0] text-white px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight">Anfitrión</div>
                )}
                <div className={`w-16 h-16 rounded-full mb-3 overflow-hidden bg-gray-50 dark:bg-gray-800 ${player.isHost ? 'border-4 border-blue-100' : ''}`}>
                  {/* Dynamically get avatar image based on player.avatarId */}
                  <img
                    className="w-full h-full object-cover"
                    alt={player.username}
                    src={cosmetics.find(c => c.id === player.avatarId)?.image || 'https://via.placeholder.com/150'} // Fallback to a placeholder
                  />
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

            {/* Empty Spot slot */}
            <div className="bg-gray-50/50 dark:bg-gray-800/20 border-2 border-dashed border-gray-200 dark:border-gray-700 p-4 rounded-3xl flex flex-col items-center justify-center opacity-60">
              <div className="w-12 h-12 rounded-full mb-2 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                <span className="material-symbols-outlined text-gray-400 select-none">person_add</span>
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Esperando...</span>
            </div>
          </section>

          {/* CTA Action buttons */}
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleStartGameAsHost} // Usar el nuevo handler
              className="w-full max-w-sm bg-amber-500 hover:bg-amber-600 text-[#1a365d] hover:text-white font-display font-extrabold py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all bouncy-tap flex items-center justify-center gap-2"
            >
              <Play size={16} className="fill-current" />
              Comenzar Partida
            </button>
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider text-center max-w-xs px-4">
              Solo el anfitrión puede iniciar el duelo cuando todos los jugadores estén listos.
            </p>
          </div>
        </motion.div>
      )}

      {/* ----------------- STAGE 4: TRIVIA GAMEPLAY ----------------- */}
      {currentScreen === AppScreen.PLAY_GAME && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <button
              onClick={handleResetFlow}
              className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Trash2 size={18} />
            </button>
            <div className="flex flex-col items-center text-center">
              <span className="text-[#2b6cb0] font-sans text-[10px] font-bold uppercase tracking-wider">
                {selectedFile?.category === 'marketing'
                  ? 'Trivia de Marketing'
                  : selectedFile?.category === 'history'
                  ? 'Trivia de Historia'
                  : 'Trivia generada por Gemini'}
              </span>
              <h2 className="font-display font-extrabold text-sm text-gray-800 dark:text-white">
                Pregunta {currentQuestionIndex + 1} de {questions.length}
              </h2>
            </div>
            <div className="w-10 h-10" /> {/* balancing space */}
          </div>

          {/* Progress Indicator and Timer bubble */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Progress line */}
            <div className="md:col-span-9 bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
              <div className="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative shadow-inner">
                <div 
                  className="h-full bg-[#2b6cb0] rounded-full relative transition-all duration-300"
                  style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                >
                  <div className="absolute inset-0 progress-bar-shine bg-white/20" />
                </div>
              </div>
            </div>

            {/* Countdown box */}
            <div className="md:col-span-3 flex justify-center md:justify-end">
              <div className={`px-5 py-2.5 rounded-2xl flex items-center gap-2 border-2 shadow-md timer-glow-pulse ${
                gameCountdown <= 5 
                  ? 'bg-red-50 dark:bg-red-950/20 text-red-500 border-red-500' 
                  : 'bg-amber-100 text-[#1a365d] border-amber-400 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
              }`}>
                <Timer size={16} />
                <span className="font-mono font-black text-lg">{gameCountdown}s</span>
              </div>
            </div>
          </div>

          {/* Question Presentation Card */}
          <div className="bg-white dark:bg-[#1e293b] p-8 md:p-12 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800/80 text-center relative overflow-hidden">
            {/* Subtle background decoration icon */}
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none select-none text-gray-400">
              <HelpCircle size={120} />
            </div>
            <h3 className="font-display font-extrabold text-lg md:text-2xl text-gray-800 dark:text-white relative z-10 leading-snug">
              {questions[currentQuestionIndex].question}
            </h3>
          </div>

          {/* Options grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['A', 'B', 'C', 'D'] as const).map((key) => {
              const activeQuestion = questions[currentQuestionIndex];
              const label = activeQuestion.options[key];
              const isSelected = selectedAnswer === key;
              const isCorrectOption = key === activeQuestion.correctOption;

              // Styles after selecting
              let optionStyle = 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e293b] hover:border-blue-400 dark:hover:border-blue-800';
              if (answerFrozen) {
                if (isCorrectOption) {
                  optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 ring-2 ring-emerald-500/20';
                } else if (isSelected) {
                  optionStyle = 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300 ring-2 ring-red-500/20';
                } else {
                  optionStyle = 'opacity-40 border-gray-100 dark:border-gray-800/40 bg-white dark:bg-[#1e293b]';
                }
              }

              return (
                <button
                  key={key}
                  disabled={answerFrozen}
                  onClick={() => handleAnswerSelect(key)}
                  className={`answer-card p-5 rounded-2xl border-2 font-semibold text-sm md:text-base flex items-center gap-4 text-left transition-all ${optionStyle}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-black text-sm flex-shrink-0 transition-colors ${
                    answerFrozen 
                      ? (isCorrectOption ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') 
                      : 'bg-gray-100 dark:bg-gray-800 text-[#2b6cb0] group-hover:bg-[#2b6cb0] group-hover:text-white'
                  }`}>
                    {key}
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 leading-tight">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Gameplay Metrics footer info */}
          <footer className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                {/* Streak */}
                <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/20 px-4 py-2 rounded-full">
                  <Flame className="w-4 h-4 text-red-500 fill-red-500" />
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">Racha: {gameStreak}</span>
                </div>

                {/* Score */}
                <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/20 px-4 py-2 rounded-full">
                  <span className="material-symbols-outlined text-amber-500 text-base material-symbols-fill select-none">monetization_on</span>
                  <span className="text-xs font-bold text-[#2b6cb0]">{gamePoints} pts</span>
                </div>
              </div>

              {/* Position rank */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Lobby Pos:</span>
                <div className="flex -space-x-1">
                  <img className="w-6 h-6 rounded-full border border-white" src={activeAvatarImage} alt="You" />
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-[#1a365d] text-[10px] font-black flex items-center justify-center border border-white">
                    {playerRank}º
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </motion.div>
      )}

      {/* ----------------- STAGE 5: GAME OVER / RESULT PODIUM ----------------- */}
      {currentScreen === AppScreen.PLAY_GAMEOVER && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-8"
        >
          {/* Confetti floating effect */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-pulse"
                style={{
                  backgroundColor: ['#2b6cb0', '#ecc94b', '#48bb78', '#f56565', '#805ad5'][i % 5],
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  opacity: Math.random() * 0.7,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${Math.random() * 3 + 2}s`
                }}
              />
            ))}
          </div>

          <div className="text-center space-y-2 relative z-10">
            <h2 className="font-display font-extrabold text-4xl text-[#005394] dark:text-[#a2c9ff] tracking-tight">
              ¡Final de la Partida!
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto leading-relaxed">
              Gran esfuerzo de todos los estudiantes. ¡Mira el podio y tus estadísticas!
            </p>
          </div>

          {/* Interactive Podium */}
          <div className="flex items-end justify-center gap-4 relative h-[280px] bg-white dark:bg-[#1e293b]/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/80 shadow-sm overflow-hidden pt-12 max-w-lg mx-auto">
            {/* 2nd Place */}
            <div className="flex flex-col items-center w-1/3">
              <div className="relative mb-2">
                <div className="w-14 h-14 rounded-full border-2 border-gray-300 overflow-hidden bg-gray-50 shadow-md">
                  <img 
                    className="w-full h-full object-cover" 
                    src={playerRank === 2 ? activeAvatarImage : 'https://lh3.googleusercontent.com/aida-public/AB6AXuAWxHF6wa9BxiYV-h77-KZ3nnZqnqYqfT1P49MnWwrN50tPfKyOUL_eEgNqzxBYhMSIWZRdy18d_qDhDnUyTTPZKavMV23eROtFqWYRTTLeUc8xXJLGKqd7lt5dsRk_Y80sRojh02ygrKXbP6OYDSDu1iAiXQYLGoMesmrOAoE-waqxlKrSk04CHlVbSWCaBSY2tZtbeyA0bhBfA02ov6PAXW3cdQS5bw82EAJwYOyCdxBCkN9a1OHPjRxVOtulo2CeIJiaFKk8L1vH'} 
                    alt="2nd Place" 
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-gray-300 text-gray-800 rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">2</div>
              </div>
              <span className="font-sans font-bold text-[11px] text-gray-700 dark:text-gray-300 truncate w-full text-center">{secondPlacePlayer}</span>
              <span className="text-[10px] text-gray-400 font-semibold">{secondPlaceScore} pts</span>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-t-xl h-20 mt-2 border-t-2 border-gray-300" />
            </div>

            {/* 1st Place */}
            <div className="flex flex-col items-center w-1/3">
              <div className="relative mb-2">
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-amber-500 fill-amber-500 animate-bounce">
                  <Trophy size={28} className="fill-current" />
                </div>
                <div className="w-18 h-14 rounded-full border-4 border-amber-400 overflow-hidden bg-gray-50 shadow-xl ring-4 ring-amber-300/30">
                  <img 
                    className="w-full h-full object-cover" 
                    src={playerRank === 1 ? activeAvatarImage : 'https://lh3.googleusercontent.com/aida-public/AB6AXuBBXi99KLkhSpNkctKhth1N4RhXVmxJA1xFGb2qenfpErnN05lJTSGKGQFpV-QYu4XMTXPdOF3QqyF0G-ztV-2Np08m1_urGvxChZNgV2GNPeOdyNZ_4uGho2W9e0-wDErBxjOG_ADw4VV5H-erRiglSuXrrA7UouhsS4XXqld-NnVxG4rE7SZtuWoRp5MJ8dIzBZfyD85IpJsb1aKxVS63-RlRASVtuNdv7Sjtt2vOXmd-r71zmU6ykdj_xWCxZO0ZpdRj9syBUFKY'} 
                    alt="1st Place" 
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-amber-400 text-[#1a365d] rounded-full w-7 h-7 flex items-center justify-center font-black text-sm border border-amber-100 shadow-md">1</div>
              </div>
              <span className="font-sans font-bold text-xs text-gray-800 dark:text-white truncate w-full text-center">{firstPlacePlayer}</span>
              <span className="text-[10px] text-amber-600 font-bold">{firstPlaceScore} pts</span>
              <div className="w-full bg-amber-100 dark:bg-amber-950/20 rounded-t-xl h-28 mt-2 border-t-2 border-amber-400 shadow-sm" />
            </div>

            {/* 3rd Place */}
            <div className="flex flex-col items-center w-1/3">
              <div className="relative mb-2">
                <div className="w-12 h-12 rounded-full border-2 border-amber-600 overflow-hidden bg-gray-50 shadow-md">
                  <img 
                    className="w-full h-full object-cover" 
                    src={playerRank === 3 ? activeAvatarImage : 'https://lh3.googleusercontent.com/aida-public/AB6AXuCR1O1XupifKntY_ZtN8JbD3iW2jL-ER4a53EXf0mLur5y4_mIj04KQONzIDDJYye5-N9VApxJ8vkOVH3qJFf7Y6HBGCChN68d8himMMyxy9cO3ak0hfsAZkvVwMQhVB_UO-NaRRqpHlad28sdILrCLQw9-Iy2_5rWV5j6hfS3dhYnaFhP-Iw-Lxte7Cpq4tD5Y28rXuYTfoU7AFK51y5pt5li8Jkk0w5VS169xld1o8Z65YjRNymUPAzID-vaZfjmJMnBMVfaNa83R'} 
                    alt="3rd Place" 
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-amber-700 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-[10px]">3</div>
              </div>
              <span className="font-sans font-bold text-[11px] text-gray-700 dark:text-gray-300 truncate w-full text-center">{thirdPlacePlayer}</span>
              <span className="text-[10px] text-gray-400 font-semibold">{thirdPlaceScore} pts</span>
              <div className="w-full bg-orange-100/50 dark:bg-orange-950/10 rounded-t-xl h-16 mt-2 border-t-2 border-amber-700" />
            </div>
          </div>

          {/* Personal statistics card */}
          <section className="bg-white dark:bg-[#1e293b] rounded-3xl p-5 shadow-md border border-gray-100 dark:border-gray-800/80 max-w-lg mx-auto space-y-4">
            <h3 className="font-display font-extrabold text-base text-gray-800 dark:text-white text-center">Tus Estadísticas</h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Correct answers */}
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl flex flex-col items-center text-center">
                <CheckCircle className="w-4 h-4 text-emerald-600 mb-1" />
                <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Aciertos</p>
                <p className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{correctAnswersCount}/{questions.length}</p>
              </div>

              {/* Point rewards */}
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl flex flex-col items-center text-center">
                <span className="material-symbols-outlined text-amber-500 text-base material-symbols-fill select-none mb-1">monetization_on</span>
                <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Puntos</p>
                <p className="font-mono text-xl font-black text-amber-600 dark:text-amber-400 mt-1">{gamePoints}</p>
              </div>

              {/* Level up XP */}
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl flex flex-col items-center text-center">
                <Sparkles className="w-4 h-4 text-[#2b6cb0] mb-1" />
                <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">XP Ganada</p>
                <div className="flex flex-col items-center">
                  <p className="font-mono text-xl font-black text-[#2b6cb0] mt-1">
                    +{correctAnswersCount * 15 * (user.isPremium ? 2 : 1)}
                  </p>
                  <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: '75%' }} />
                  </div>
                  <p className="text-[8px] font-black text-[#2b6cb0] mt-0.5">LVL {user.level} → LVL {user.level + (user.xp + correctAnswersCount * 15 * (user.isPremium ? 2 : 1) >= user.maxXp ? 1 : 0)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Action Footer Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mx-auto pt-4 relative z-10">
            <button
              onClick={handleResetFlow}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-[#1a365d] hover:text-white font-display font-extrabold py-3.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all bouncy-tap flex items-center justify-center gap-1.5 text-sm"
            >
              <RotateCcw size={16} />
              Jugar de Nuevo
            </button>
            <button
              onClick={() => onNavigate(AppScreen.HOME)}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-display font-extrabold py-3.5 px-4 rounded-xl shadow-sm transition-all bouncy-tap flex items-center justify-center gap-1.5 text-sm"
            >
              <LayoutDashboard size={16} />
              Panel Principal
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
