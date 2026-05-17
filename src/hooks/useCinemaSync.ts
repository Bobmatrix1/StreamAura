import { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, ILocalAudioTrack } from 'agora-rtc-sdk-ng';
import { API_BASE_URL } from '../api/mediaApi';

interface ChatMessage {
  uid: string;
  text: string;
  timestamp: number;
}

interface CinemaState {
  status: 'playing' | 'paused' | 'waiting';
  movieTime: number;
  hostUid: string;
  mutedAll: boolean;
  currentEpisodeIndex?: number;
}

export const useCinemaSync = (roomId: string | null, user: any, isAdmin: boolean = false) => {
  const [roomState, setRoomState] = useState<CinemaState | null>(null);
  const [viewers, setViewers] = useState<number>(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const ws = useRef<WebSocket | null>(null);
  const agoraClient = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrack = useRef<ILocalAudioTrack | null>(null);

  // WebSocket Logic
  useEffect(() => {
    if (!roomId || !user) return;

    const socketUrl = `${import.meta.env.VITE_SOCKET_URL || 'ws://localhost:8000'}/api/ws/cinema/${roomId}/ws`;
    ws.current = new WebSocket(socketUrl);

    ws.current.onopen = () => {
      console.log('Cinema WS Connected');
      if (!isAdmin) {
        ws.current?.send(JSON.stringify({ type: 'join', uid: user.uid }));
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'init':
          setRoomState(data.state);
          break;
        case 'playback_sync':
          setRoomState(prev => prev ? { ...prev, status: data.status, movieTime: data.time } : null);
          break;
        case 'episode_sync':
          setRoomState(prev => prev ? { ...prev, currentEpisodeIndex: data.index, movieTime: 0, status: 'playing' } : null);
          break;
        case 'chat':
          setMessages(prev => [...prev, data.message].slice(-100));
          break;
        case 'user_joined':
          setViewers(prev => prev + 1);
          break;
        case 'user_left':
          setViewers(prev => Math.max(0, prev - 1));
          break;
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [roomId, user]);

  // Sync controls (Host Only)
  const syncPlayback = useCallback((status: 'play' | 'pause' | 'seek', time: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: status, time, uid: user?.uid }));
    }
  }, [user]);

  const syncEpisode = useCallback((index: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'next_episode', index, uid: user?.uid }));
    }
  }, [user]);

  const sendChatMessage = useCallback((text: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'chat', text, uid: user?.uid }));
    }
  }, [user]);

  // Agora Logic
  const joinVoice = async () => {
    if (!roomId || !user) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/cinema/agora/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, role: 'publisher' })
      });
      const { token, uid, app_id } = await response.json();

      agoraClient.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      await agoraClient.current.join(app_id, roomId, token, uid);

      localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack();
      await localAudioTrack.current.setEnabled(!isMuted);
      await agoraClient.current.publish([localAudioTrack.current]);

      agoraClient.current.on('user-published', async (remoteUser, mediaType) => {
        if (mediaType === 'audio') {
          await agoraClient.current?.subscribe(remoteUser, mediaType);
          remoteUser.audioTrack?.play();
        }
      });

      setIsVoiceActive(true);
    } catch (err) {
      console.error('Agora join error:', err);
    }
  };

  const toggleMute = async () => {
    if (localAudioTrack.current) {
      const newMute = !isMuted;
      await localAudioTrack.current.setEnabled(!newMute);
      setIsMuted(newMute);
    }
  };

  const leaveVoice = async () => {
    localAudioTrack.current?.stop();
    localAudioTrack.current?.close();
    await agoraClient.current?.leave();
    setIsVoiceActive(false);
  };

  return {
    roomState,
    viewers,
    messages,
    isVoiceActive,
    isMuted,
    syncPlayback,
    syncEpisode,
    sendChatMessage,
    joinVoice,
    leaveVoice,
    toggleMute
  };
};
