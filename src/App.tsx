import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { DownloadProvider } from './contexts/DownloadContext';
import { AppContent } from './AppContent';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="dark">
        <ToastProvider>
          <DownloadProvider>
            <AppContent />
          </DownloadProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
