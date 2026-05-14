import React from 'react';
import { motion } from 'framer-motion';
import { Lock, LogIn, UserPlus } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';

interface LoginRequiredProps {
  title: string;
  description: string;
  icon?: React.ElementType;
}

export const LoginRequired: React.FC<LoginRequiredProps> = ({ 
  title, 
  description, 
  icon: Icon = Lock 
}) => {
  const { requireAuth } = useAuth();

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center"
    >
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-primary/20 blur-[50px] rounded-full animate-pulse" />
        <div className="relative w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl">
          <Icon className="w-10 h-10 text-primary" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-background border border-white/10 flex items-center justify-center">
          <Lock className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      <h2 className="text-2xl font-black uppercase tracking-tight mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm max-w-sm mb-8 leading-relaxed">
        {description}
      </p>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs">
        <Button 
          onClick={() => requireAuth(() => {}, 'login')} 
          className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-[10px] gradient-bg shadow-lg shadow-primary/20"
        >
          <LogIn className="w-4 h-4 mr-2" /> Sign In
        </Button>
        <Button 
          variant="outline"
          onClick={() => requireAuth(() => {}, 'signup')} 
          className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-[10px] border-white/10 hover:bg-white/5"
        >
          <UserPlus className="w-4 h-4 mr-2" /> Create Account
        </Button>
      </div>

      <p className="mt-8 text-[9px] text-muted-foreground font-bold uppercase tracking-[0.2em]">
        Join StreamAura to unlock premium features
      </p>
    </motion.div>
  );
};
