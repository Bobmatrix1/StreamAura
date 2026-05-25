import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export type GameStatus = 'waiting' | 'selecting' | 'convincing' | 'choosing' | 'revealing' | 'round_finished' | 'finished' | 'deleted';

export interface GameState {
  status: GameStatus;
  playerA: any | null;
  playerB: any | null;
  timer: number;
  choices: { [uid: string]: 'split' | 'steal' | null };
  revealResult: 'share' | 'one_steal' | 'none' | null;
  participants: any[];
  currentRound?: number;
  prizeAmount?: number;
}

export const useGameSync = (gameId: string | null, user: any) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [flyingEmojis, setFlyingEmojis] = useState<{ id: number; emoji: string }[]>([]);
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
          prizeAmount: data.prizeAmount,
          currentRound: data.currentRound || 1,
          numberOfRounds: data.numberOfRounds || 1,
          isMultipleRounds: data.isMultipleRounds || false
        } as any));
      }
    });

    // 2. WebSocket for Real-time Timer and Chat
    let socketBase = import.meta.env.VITE_SOCKET_URL;
    if (!socketBase) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const isProduction = host.includes('streamaura.site') || host.includes('onrender.com');
      const port = !isProduction ? ':8000' : '';
      socketBase = `${protocol}//${host}${port}`;
    }

    const socketUrl = `${socketBase}/api/ws/games/${gameId}/ws`;
    ws.current = new WebSocket(socketUrl);

    ws.current.onopen = () => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ 
          type: 'join',
          uid: user?.uid,
          name: user?.displayName || user?.name || 'Anonymous',
          photo: user?.photoURL || user?.picture
        }));
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'game_update':
          setGameState(prev => ({ ...prev, ...data.state }));
          if (data.state.messages) {
            setMessages(data.state.messages);
          }
          break;
        case 'chat':
          setMessages(prev => [...prev, data.message].slice(-50));
          break;
        case 'chat_reaction':
          setMessages(prev => prev.map(msg => 
            msg.id === data.messageId 
              ? { 
                  ...msg, 
                  reactions: { 
                    ...(msg.reactions || {}), 
                    [data.emoji]: [...(msg.reactions?.[data.emoji] || []), data.uid].filter((v, i, a) => a.indexOf(v) === i) 
                  } 
                } 
              : msg
          ));
          break;
        case 'emoji':
          // Use more unique ID to prevent duplicate keys
          const emojiId = Date.now() + Math.random();
          setFlyingEmojis(prev => [...prev, { id: emojiId, emoji: data.emoji, origin: data.origin }]);
          setTimeout(() => {
            setFlyingEmojis(prev => prev.filter(e => e.id !== emojiId));
          }, 4000);
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
      ws.current.send(JSON.stringify({ 
        type, 
        ...payload, 
        uid: user?.uid,
        name: user?.displayName || user?.name || 'Anonymous',
        photo: user?.photoURL || user?.picture,
        isAdmin: !!user?.isAdmin // Explicitly pass admin status
      }));
    }
  }, [user]);

  return { gameState, messages, flyingEmojis, sendAction };
};
