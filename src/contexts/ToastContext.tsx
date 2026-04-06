import * as React from 'react';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  Info as InfoIcon, 
  AlertTriangle, 
  X 
} from 'lucide-react';
import type { Toast, ToastType } from '@/types';

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const toastIcons = {
  success: CheckCircle,
  error: XCircle,
  info: InfoIcon,
  warning: AlertTriangle
};

const toastColors = {
  success: 'bg-green-500/20 border-green-500/30 text-green-400',
  error: 'bg-red-500/20 border-red-500/30 text-red-400',
  info: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
  warning: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((
    message: string, 
    type: ToastType = 'info', 
    duration: number = 4000
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const showSuccess = useCallback((m: string, d?: number) => showToast(m, 'success', d), [showToast]);
  const showError = useCallback((m: string, d?: number) => showToast(m, 'error', d), [showToast]);
  const showInfo = useCallback((m: string, d?: number) => showToast(m, 'info', d), [showToast]);
  const showWarning = useCallback((m: string, d?: number) => showToast(m, 'warning', d), [showToast]);

  const value = React.useMemo(() => ({ 
    showToast, showSuccess, showError, showInfo, showWarning 
  }), [showToast, showSuccess, showError, showInfo, showWarning]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 left-4 md:left-auto z-[99999] flex flex-col items-center md:items-end gap-2 md:max-w-sm pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const Icon = toastIcons[toast.type];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`pointer-events-auto glass-card p-4 flex items-start gap-3 w-full max-w-sm shadow-2xl border ${toastColors[toast.type]}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="flex-1 text-sm font-medium break-words leading-relaxed">{toast.message}</p>
                <button onClick={() => removeToast(toast.id)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
