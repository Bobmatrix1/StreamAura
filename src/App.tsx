import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { DownloadProvider } from './contexts/DownloadContext';
import { AppContent } from './AppContent';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ThemeProvider defaultTheme="dark">
          <DownloadProvider>
            <AppContent />
          </DownloadProvider>
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
