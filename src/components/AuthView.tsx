import { useState, useEffect, useRef, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { User, Mail, School, Lock, FileText, Eye, EyeOff, LogIn, UserPlus, Sparkles, Globe } from 'lucide-react';
// @ts-ignore
import image11 from '../assets/images/image_11_1783214081579.jpg';
// @ts-ignore
import image13 from '../assets/images/image_13_1783214092077.jpg';

declare global {
  interface Window {
    google?: any;
  }
}

interface AuthViewProps {
  onLoginSuccess: (user: UserProfile) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4001';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
function toUserProfile(user: UserProfile): UserProfile {
  return {
    username: user.username,
    email: user.email,
    institution: user.institution,
    bio: user.bio,
    level: user.level,
    xp: user.xp,
    maxXp: user.maxXp,
    coins: user.coins,
    credits: user.credits ?? 0,
    avatarId: user.avatarId,
    isPremium: user.isPremium,
  };
}

export default function AuthView({ onLoginSuccess }: AuthViewProps) {
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form states
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [institution, setInstitution] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // Form error states
  const [error, setError] = useState<string>('');
  const [googleError, setGoogleError] = useState<string>('');
  const [isGoogleLoaded, setIsGoogleLoaded] = useState<boolean>(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response: any) => {
            if (!response?.credential) {
              setGoogleError('No se recibió credencial de Google.');
              return;
            }

            setError('');
            setGoogleError('');
            setIsSubmitting(true);

            try {
              const tokenResponse = await fetch(`${API_BASE_URL}/api/auth/google/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: response.credential }),
              });

              const payload = await tokenResponse.json().catch(() => ({}));
              if (!tokenResponse.ok) {
                throw new Error(payload?.error ?? 'No se pudo iniciar sesión con Google.');
              }

              onLoginSuccess(toUserProfile(payload.user));
            } catch (submitError) {
              setError(submitError instanceof Error ? submitError.message : 'Ocurrió un error al iniciar sesión con Google.');
            } finally {
              setIsSubmitting(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 310,
        });

        setIsGoogleLoaded(true);
      } else {
        setGoogleError('No se pudo cargar Google Identity Services.');
      }
    };
    script.onerror = () => setGoogleError('No se pudo cargar la biblioteca de Google.');

    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleGoogleLogin = () => {
    if (!window.google?.accounts?.id) {
      setGoogleError('Google Identity no está disponible.');
      return;
    }

    window.google.accounts.id.prompt();
  };

  const handleToggleMode = () => {
    setIsLoginMode(prev => !prev);
    setError('');
    setUsername('');
    setEmail('');
    setInstitution('');
    setBio('');
    setPassword('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (!username.trim()) {
        setError('Por favor, ingresa tu nombre de usuario.');
        return;
      }
      if (username.trim().length < 3) {
        setError('El nombre de usuario debe tener al menos 3 caracteres.');
        return;
      }
      if (!password) {
        setError('Por favor, ingresa tu contraseña.');
        return;
      }
      if (password.length < 4) {
        setError('La contraseña debe tener al menos 4 caracteres.');
        return;
      }

      if (isLoginMode) {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: username.trim(),
            password,
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error ?? 'No se pudo iniciar sesión.');
        }

        onLoginSuccess(toUserProfile(payload.user));
      } else {
        if (!email.trim() || !email.includes('@')) {
          setError('Por favor, ingresa un correo electrónico válido.');
          return;
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim(),
            institution: institution.trim(),
            bio: bio.trim(),
            password,
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error ?? 'No se pudo crear la cuenta.');
        }

        onLoginSuccess(toUserProfile(payload.user));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ocurrió un error inesperado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#090d16] flex items-center justify-center p-4 md:p-8 transition-colors duration-300">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-5xl bg-white dark:bg-[#0f172a] rounded-3xl overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-800/60 flex flex-col md:flex-row min-h-[600px]"
      >
        {/* Left column: Dynamic illustration & Branding banner */}
        <div className="w-full md:w-1/2 bg-gradient-to-br from-blue-900 via-indigo-900 to-[#0b0f19] text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle background overlay patterns */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-4 h-4 text-[#1a365d] fill-[#1a365d]" />
              </div>
              <span className="font-display text-2xl font-black tracking-tight bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                StudyClash
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={isLoginMode ? 'login-caption' : 'signup-caption'}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
                  {isLoginMode ? (
                    <>Estudia, Compite y <span className="text-amber-400">Domina</span> con Amigos</>
                  ) : (
                    <>Desbloquea tu <span className="text-blue-400">Potencial</span> Académico</>
                  )}
                </h2>
                <p className="text-gray-300 text-sm leading-relaxed max-w-md">
                  {isLoginMode 
                    ? 'Inicia sesión para volver a tus desafíos de estudio diario, equipar tus skins legendarias y desafiar a tu salón en batallas de conocimiento en tiempo real.'
                    : 'Crea tu cuenta gratuita hoy para comenzar a ganar monedas virtuales, subir de nivel, desbloquear avatares personalizados y subir archivos PDF para autogenerar cuestionarios.'
                  }
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Interactive Image Container for generated image 11 & 13 */}
          <div className="relative z-10 w-full h-56 md:h-64 mt-8 rounded-2xl overflow-hidden border border-white/10 shadow-lg">
            <AnimatePresence mode="wait">
              {isLoginMode ? (
                <motion.img
                  key="image11"
                  src={image11}
                  alt="Login Illustration"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <motion.img
                  key="image13"
                  src={image13}
                  alt="Register Illustration"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-4">
              <span className="text-xs font-semibold tracking-wider text-amber-300 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full uppercase">
                {isLoginMode ? 'Ilustración de Inicio' : 'Comunidad y Trofeos'}
              </span>
            </div>
          </div>

          <div className="relative z-10 text-[11px] text-gray-400 mt-6 font-mono">
            <span>STUDYCLASH ENGINE v1.2 // SECURE CONNECTION</span>
          </div>
        </div>

        {/* Right column: Authentication forms */}
        <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoginMode ? '¡Hola de nuevo!' : 'Comienza tu Aventura'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                {isLoginMode 
                  ? 'Ingresa tus credenciales para acceder a la arena.' 
                  : 'Regístrate para crear tu perfil y guardar tu progreso.'
                }
              </p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl text-xs font-semibold mb-6 flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
            {googleError && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-100 dark:border-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-4 py-3 rounded-2xl text-xs font-semibold mb-6 flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" />
                <span>{googleError}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider pl-1">
                  Nombre de usuario
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                    <User size={16} />
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ej. ProfeGamer_99"
                    className="w-full bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/40 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2b6cb0] dark:focus:ring-blue-500/50 transition-all text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Email (Signup only) */}
              {!isLoginMode && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider pl-1">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                      <Mail size={16} />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="estudiante@correo.com"
                      className="w-full bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/40 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2b6cb0] dark:focus:ring-blue-500/50 transition-all text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Institution (Signup only) */}
              {!isLoginMode && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider pl-1">
                    Institución Educativa / Colegio
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                      <School size={16} />
                    </span>
                    <input
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="Ej. Instituto Nacional de Ciencias"
                      className="w-full bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/40 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2b6cb0] dark:focus:ring-blue-500/50 transition-all text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Bio (Signup only) */}
              {!isLoginMode && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider pl-1">
                    Biografía corta (Opcional)
                  </label>
                  <div className="relative">
                    <span className="absolute top-3.5 left-0 flex items-start pl-4 text-gray-400">
                      <FileText size={16} />
                    </span>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Cuéntanos un poco sobre ti y tus metas académicas..."
                      rows={2}
                      className="w-full bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/40 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2b6cb0] dark:focus:ring-blue-500/50 transition-all text-gray-900 dark:text-white resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider pl-1">
                  Contraseña
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                    <Lock size={16} />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/40 rounded-2xl py-3.5 pl-11 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#2b6cb0] dark:focus:ring-blue-500/50 transition-all text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 space-y-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#2b6cb0] hover:bg-[#235891] dark:bg-[#3182ce] dark:hover:bg-[#2b6cb0] text-white font-extrabold text-sm py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/10 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span>Procesando...</span>
                  ) : isLoginMode ? (
                    <>
                      <LogIn size={16} />
                      <span>Iniciar Sesión</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} />
                      <span>Crear Cuenta</span>
                    </>
                  )}
                </button>

                {GOOGLE_CLIENT_ID && (
              <div ref={googleButtonRef} className="w-full" />
            )}
              </div>
            </form>

            <div className="mt-8 text-center">
              <button
                onClick={handleToggleMode}
                className="text-xs font-bold text-[#2b6cb0] dark:text-blue-400 hover:underline cursor-pointer"
              >
                {isLoginMode 
                  ? '¿No tienes una cuenta aún? Regístrate aquí' 
                  : '¿Ya tienes una cuenta de StudyClash? Inicia sesión'
                }
              </button>
            </div>

            {/* Quick Demo tip */}
            {isLoginMode && (
              <div className="mt-6 p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/10 text-center">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="font-bold text-[#2b6cb0] dark:text-blue-400">Importante:</span> solo puedes entrar con una cuenta ya creada y guardada en la BD.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
