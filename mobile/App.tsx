import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { DownloadProvider } from './src/contexts/DownloadContext';
import Login from './src/screens/Login';
import Signup from './src/screens/Signup';
import MovieDownloader from './src/screens/MovieDownloader';
import { ActivityIndicator, View } from 'react-native';

import MainNavigator from './src/screens/MainNavigator';

const AppContent = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [isLoginView, setIsLoginView] = useState(true);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return isLoginView ? (
      <Login onToggleView={() => setIsLoginView(false)} />
    ) : (
      <Signup onToggleView={() => setIsLoginView(true)} />
    );
  }

  return <MainNavigator />;
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DownloadProvider>
          <AppContent />
          <StatusBar style="light" />
        </DownloadProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
