import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, X, Award } from 'lucide-react';

const loc1 = 'localhost';
const defaultUrl = 'http://' + loc1 + ':4001';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? defaultUrl;

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPremium: boolean;
  username: string;
  userEmail?: string;
  onPurchaseSuccess: (preferenceId: string, collectionId?: string) => Promise<void>;
}

export default function PremiumModal({
  isOpen,
  onClose,
  isPremium,
  username,
  userEmail,
  onPurchaseSuccess,
}: PremiumModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string>('');

  const handleBuyPremium = async () => {
    setPaymentError('');
    setPaymentMessage('');

    if (!userEmail) {
      setPaymentError('No se encontró tu correo.');
      return;
    }

    setIsProcessing(true);

    try {
      const pathSub = '/api/payments/sub' + 'scription';
      const fetchUrl = API_BASE_URL + pathSub;
      
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, username }),
      });

      const payload = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Error de pago.');
      }

      const preference = payload.preference ?? {};
      const checkoutLink = preference.init_point || preference.sandbox_init_point;
      
      if (!checkoutLink) {
        throw new Error('No se obtuvo un enlace de Mercado Pago.');
      }

      setPreferenceId(preference.id ?? null);
      setPaymentMessage('Se abrió Mercado Pago. Completa y pulsa confirmar.');
      
      window.open(checkoutLink, '_blank');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Error al iniciar el pago.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmPremium = async () => {
    setPaymentError('');
    setPaymentMessage('');
    setIsProcessing(true);

    try {
      if (!preferenceId) {
        throw new Error('Primero debes iniciar el proceso en Mercado Pago.');
      }
      await onPurchaseSuccess(preferenceId);
      setPaymentMessage('¡Premium activado con éxito!');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Error al activar Premium.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative bg-white dark:bg-[#1e293b] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl z-10 border border-amber-500/20"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 z-20">
              <X size={20} />
            </button>

            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-8 text-center text-white relative">
              <h3 className="font-extrabold text-2xl">StudyClash Premium</h3>
              <p className="text-sm mt-1">Sube de nivel tu manera de estudiar</p>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-gray-600 dark:text-gray-300 text-sm text-center">
                Desbloquea todo el potencial de StudyClash.
              </p>

              <button
                onClick={handleBuyPremium}
                disabled={isProcessing || isPremium}
                className="w-full py-4 rounded-2xl font-bold bg-amber-500 text-white flex justify-center items-center gap-2"
              >
                <Award size={18} />
                {isPremium ? 'Ya eres Premium' : isProcessing ? 'Creando pago...' : 'Pagar con Mercado Pago'}
              </button>

              {!isPremium && (
                <button
                  type="button"
                  onClick={handleConfirmPremium}
                  disabled={isProcessing || !preferenceId}
                  className="w-full py-4 rounded-2xl font-bold bg-blue-500 text-white disabled:opacity-50"
                >
                  {preferenceId ? 'Confirmar compra' : 'Abrir Mercado Pago primero'}
                </button>
              )}

              {paymentMessage && <p className="text-xs text-emerald-500 text-center">{paymentMessage}</p>}
              {paymentError && <p className="text-xs text-red-500 text-center">{paymentError}</p>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}