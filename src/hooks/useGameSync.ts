import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export type GameStatus = 'waiting' | 'selecting' | 'convincing' | 'choosing' | 'revealing' | 'round_finished' | 'finished';

export interface GameState {
  status: GameStatus;
  playerA: any | null;
  playerB: any | null;
  timer: number;
  choices: { [uid: string]: 'split' | 'steal' | null };
  revealResult: 'share' | 'one_steal' | 'none' | null;
  participants: any[];
  currentRound?: number;
}

export const useGameSync = (gameId: string | null, user: any) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!gameId || !user) return;

    // 1. Listen to Firestore for Participants and Basic Info
    const unsubscribe = onSnapshot(doc(db, 'game_rooms', gameId), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as any;
        setGameState(prev => ({
          ...prev,
          participants: data.participants || [],
          status: data.status || 'waiting',
          playerA: data.playerA || null,
          playerB: data.playerB || null,
          prizeAmount: data.prizeAmount
        } as any));
      }
    });

    // 2. WebSocket for Real-time Timer and Chat
    const socketUrl = `${import.meta.env.VITE_SOCKET_URL || 'ws://localhost:8000'}/api/ws/games/${gameId}/ws`;
    ws.current = new WebSocket(socketUrl);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'game_update':
          setGameState(prev => ({ ...prev, ...data.state }));
          break;
        case 'chat':
          setMessages(prev => [...prev, data.message].slice(-50));
          break;
        case 'emoji':
          // Handle flying emojis if needed
          break;
      }
    };

    return () => {
      unsubscribe();
      ws.current?.close();
    };
  }, [gameId, user?.uid]);

  const sendAction = useCallback((type: string, payload: any = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...payload, uid: user?.uid }));
    }
  }, [user?.uid]);

  return { gameState, messages, sendAction };
};
