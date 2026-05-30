import { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, ILocalAudioTrack } from 'agora-rtc-sdk-ng';
import { API_BASE_URL } from '../api/mediaApi';
import { auth, db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField
} from 'firebase/firestore';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  uid: string;
  text: string;
  userName: string;
  userPhoto: string | null;
  timestamp: any;
  reactions?: Record<string, string[]>; // emoji -> array of uids
}

interface CinemaState {
  status: 'playing' | 'paused' | 'waiting';
  movieTime: number;
  hostUid: string;
  mutedAll: boolean;
  currentEpisodeIndex?: number;
}

export const useCinemaSync = (roomId: string | null, user: any) => {
  const [roomState, setRoomState] = useState<CinemaState | null>(null);
  const [viewers, setViewers] = useState<number>(0);
  const [activeUserUids, setActiveUserUids] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const ws = useRef<WebSocket | null>(null);
  const agoraClient = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrack = useRef<ILocalAudioTrack | null>(null);

  // WebSocket Logic (Synchronization Only)
  useEffect(() => {
    if (!roomId || !user) return;

    const socketUrl = `${import.meta.env.VITE_SOCKET_URL || 'ws://localhost:8000'}/api/ws/cinema/${roomId}/ws`;
    ws.current = new WebSocket(socketUrl);

    ws.current.onopen = () => {
      console.log('Cinema WS Connected');
      ws.current?.send(JSON.stringify({ type: 'join', uid: user.uid }));
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
        case 'user_list':
          setActiveUserUids(data.users);
          setViewers(data.users.length);
          break;
        case 'kicked':
          toast.warning("You have been kicked from the room.");
          window.location.reload(); // Force exit via reload
          break;
        case 'error':
          toast.error(data.message);
          break;
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [roomId, user]);

  // Persistent Firestore Chat Logic
  useEffect(() => {
    if (!roomId) return;

    const chatRef = collection(db, 'cinema_rooms', roomId, 'chat');
    const q = query(chatRef, orderBy('timestamp', 'asc'), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(newMessages);
    });

    return () => unsubscribe();
  }, [roomId]);

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

  const sendChatMessage = useCallback(async (text: string) => {
    if (!roomId || !user || !text.trim()) return;

    try {
      await addDoc(collection(db, 'cinema_rooms', roomId, 'chat'), {
        uid: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL,
        text: text.trim(),
        timestamp: serverTimestamp(),
        reactions: {}
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }, [roomId, user]);

  const reactToMessage = useCallback(async (messageId: string, emoji: string) => {
    if (!roomId || !user) return;

    try {
      const msgRef = doc(db, 'cinema_rooms', roomId, 'chat', messageId);
      const msgSnap = await getDoc(msgRef);
      
      if (msgSnap.exists()) {
        const reactions = msgSnap.data().reactions || {};
        const uids = reactions[emoji] || [];
        
        if (uids.includes(user.uid)) {
          // Remove reaction
          const newUids = uids.filter((id: string) => id !== user.uid);
          if (newUids.length === 0) {
            await updateDoc(msgRef, {
              [`reactions.${emoji}`]: deleteField()
            });
          } else {
            await updateDoc(msgRef, {
              [`reactions.${emoji}`]: arrayRemove(user.uid)
            });
          }
        } else {
          // Add reaction
          await updateDoc(msgRef, {
            [`reactions.${emoji}`]: arrayUnion(user.uid)
          });
        }
      }
    } catch (err) {
      console.error('Failed to react:', err);
    }
  }, [roomId, user]);

  // Agora Logic
  const joinVoice = async () => {
    if (!roomId || !user) return;
    
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication token missing');

      const response = await fetch(`${API_BASE_URL}/api/cinema/agora/token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ room_id: roomId, role: 'publisher' })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.app_id || !data.token) {
        throw new Error('Invalid response from token server');
      }

      const { token, uid, app_id } = data;

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
    activeUserUids,
    messages,
    isVoiceActive,
    isMuted,
    syncPlayback,
    syncEpisode,
    sendChatMessage,
    joinVoice,
    leaveVoice,
    toggleMute,
    reactToMessage,
    moderateUser: async (uid: string, action: 'kick' | 'ban' | 'mute' | 'unmute' | 'cohost') => {
      if (!roomId) return;
      const roomRef = doc(db, 'cinema_rooms', roomId);
      
      if (action === 'kick') {
        // 1. Update Firestore (optional, for record)
        await updateDoc(roomRef, { [`kickedUsers.${uid}`]: serverTimestamp() });
        // 2. Send WS message for immediate disconnection
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'kick', target_uid: uid }));
        }
        toast.success("User kicked");
      } else if (action === 'ban') {
        await updateDoc(roomRef, { [`bannedUsers.${uid}`]: true });
        toast.success("User banned");
      } else if (action === 'mute') {
        await updateDoc(roomRef, { [`mutedUsers.${uid}`]: true });
        toast.success("User muted");
      } else if (action === 'unmute') {
        await updateDoc(roomRef, { [`mutedUsers.${uid}`]: deleteField() });
        toast.success("User unmuted");
      } else if (action === 'cohost') {
        await updateDoc(roomRef, { [`coHosts.${uid}`]: true });
        toast.success("Appointed as Co-Host");
      }
    }
  };
};
