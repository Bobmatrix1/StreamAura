import React, { type ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { ToastProvider } from '../contexts/ToastContext';
import { DownloadProvider } from '../contexts/DownloadContext';

interface ProvidersProps {
  children: ReactNode;
}

export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="dark">
        <ToastProvider>
          <DownloadProvider>
            {children}
          </DownloadProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};
