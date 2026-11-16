// src/hooks/useMessagingSocket.ts
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/useMessagingSocket.js (Oct 2026 two-lane backend).
// Sends still go over REST (POST /v1/messages). This hook opens ONE STOMP
// connection, authenticates with the JWT in the CONNECT frame (matching the
// backend's StompAuthChannelInterceptor) and streams what the inbox needs:
//
//   /user/queue/messages       new messages                          → onMessage
//   /user/queue/typing         { conversationId, userId, typing }    → onTyping
//   /user/queue/presence       { userId, online }                    → onPresence
//   /user/queue/reactions      { conversationId, messageId, reactions } → onReaction
//   /user/queue/read           { conversationId, readerId, readAt }  → onRead
//   /user/queue/conversations  { conversationId, status }            → onConversation
//
// and returns sendTyping(conversationId, typing) → SEND /app/typing.
//
// ── Transport ──
// The backend registers /ws with SockJS only (WebSocketConfig). SockJS also
// serves a plain WebSocket at {endpoint}/websocket, which is what this hook
// uses — React Native has a native WebSocket, and STOMP is a small text
// protocol, so no stompjs/sockjs libraries are needed. (The previous mobile
// hook dialed /ws itself, which only answers SockJS's HTTP handshake, so
// live messages never arrived on mobile.) The Origin header is set to the
// web origin the backend allows.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { WEB_ORIGIN } from '../config/links';

const API_BASE_URL = 'https://unismvp-production.up.railway.app/api';

function resolveWsUrl(): string {
  const origin = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${origin.replace(/^http/, 'ws')}/ws/websocket`;
}

const NULL = '\u0000';

// STOMP 1.2 header escaping.
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/:/g, '\\c').replace(/\r/g, '\\r');

function buildFrame(command: string, headers: Record<string, string>, body = ''): string {
  const head = Object.entries(headers).map(([k, v]) => `${k}:${command === 'CONNECT' ? v : esc(v)}`).join('\n');
  return `${command}\n${head}\n\n${body}${NULL}`;
}

interface ParsedFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

/** One socket message can carry several frames (and bare heartbeats). */
function parseFrames(data: string): ParsedFrame[] {
  return String(data || '')
    .split(NULL)
    .map((chunk) => chunk.replace(/^[\r\n]+/, ''))
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const divider = chunk.indexOf('\n\n');
      const rawHead = divider === -1 ? chunk : chunk.slice(0, divider);
      const body = divider === -1 ? '' : chunk.slice(divider + 2);
      const lines = rawHead.split('\n');
      const command = (lines.shift() || '').trim();
      const headers: Record<string, string> = {};
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx > -1) headers[line.slice(0, idx)] = line.slice(idx + 1);
      }
      return { command, headers, body };
    })
    .filter((f) => !!f.command);
}

export interface SocketHandlers {
  onTyping?: (e: { conversationId: string; userId?: string; typing: boolean }) => void;
  onPresence?: (e: { userId: string; online: boolean }) => void;
  onReaction?: (e: { conversationId: string; messageId: string; reactions: any[] }) => void;
  onRead?: (e: { conversationId: string; readerId?: string; readAt: string }) => void;
  onConversation?: (e: { conversationId: string; status?: string }) => void;
}

const CHANNELS: [string, keyof SocketHandlers][] = [
  ['/user/queue/typing', 'onTyping'],
  ['/user/queue/presence', 'onPresence'],
  ['/user/queue/reactions', 'onReaction'],
  ['/user/queue/read', 'onRead'],
  ['/user/queue/conversations', 'onConversation'],
];

export function useMessagingSocket(onMessage: (message: any) => void, handlers: SocketHandlers = {}) {
  const [connected, setConnected] = useState(false);
  const messageRef = useRef(onMessage);
  const handlersRef = useRef(handlers);
  const wsRef = useRef<WebSocket | null>(null);
  const readyRef = useRef(false);
  messageRef.current = onMessage;
  handlersRef.current = handlers;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const subs: Record<string, string> = {};

    const cleanupSocket = () => {
      readyRef.current = false;
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      try { ws?.close(); } catch { /* closed */ }
      ws = null;
      wsRef.current = null;
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnect) return;
      reconnect = setTimeout(() => {
        reconnect = null;
        connect();
      }, 4000); // matches web reconnectDelay
    };

    const connect = async () => {
      const token = await SecureStore.getItemAsync('token');
      if (!token || cancelled) return;
      try {
        // RN's WebSocket accepts headers as a third argument.
        ws = new (WebSocket as any)(resolveWsUrl(), [], { headers: { Origin: WEB_ORIGIN } });
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws!.onopen = () => {
        ws?.send(buildFrame('CONNECT', {
          'accept-version': '1.1,1.2',
          host: 'unismvp-production.up.railway.app',
          Authorization: `Bearer ${token}`,
          'heart-beat': '10000,10000',
        }));
      };

      ws!.onmessage = (evt: any) => {
        for (const frame of parseFrames(String(evt.data))) {
          if (frame.command === 'CONNECTED') {
            readyRef.current = true;
            setConnected(true);
            ws?.send(buildFrame('SUBSCRIBE', { id: 'sub-messages', destination: '/user/queue/messages' }));
            subs['sub-messages'] = 'messages';
            CHANNELS.forEach(([destination, key], i) => {
              const id = `sub-${i}`;
              subs[id] = key;
              ws?.send(buildFrame('SUBSCRIBE', { id, destination }));
            });
            heartbeat = setInterval(() => {
              try { ws?.send('\n'); } catch { /* closed */ }
            }, 10000);
            continue;
          }
          if (frame.command === 'MESSAGE') {
            let payload: any = null;
            try { payload = JSON.parse(frame.body); } catch (err: any) {
              console.error('[Messages] malformed socket frame dropped:', err?.message || err);
              continue;
            }
            const sub = subs[frame.headers.subscription] || '';
            const dest = frame.headers.destination || '';
            if (sub === 'messages' || dest.endsWith('/queue/messages')) {
              messageRef.current?.(payload);
            } else {
              const key = (sub || CHANNELS.find(([d]) => dest.endsWith(d.replace('/user', '')))?.[1]) as keyof SocketHandlers | undefined;
              if (key) (handlersRef.current?.[key] as any)?.(payload);
            }
            continue;
          }
          if (frame.command === 'ERROR') {
            console.warn('[Messages] socket error frame:', frame.headers.message || frame.body);
            setConnected(false);
          }
        }
      };

      ws!.onerror = () => setConnected(false);
      ws!.onclose = () => {
        setConnected(false);
        readyRef.current = false;
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        scheduleReconnect();
      };
    };

    connect();

    // Phones drop sockets in the background; reconnect when the app returns.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !readyRef.current && !cancelled) {
        cleanupSocket();
        if (reconnect) { clearTimeout(reconnect); reconnect = null; }
        connect();
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
      if (reconnect) clearTimeout(reconnect);
      try { ws?.send(buildFrame('DISCONNECT', {})); } catch { /* closed */ }
      cleanupSocket();
    };
  }, []);

  const sendTyping = useCallback((conversationId: string, typing: boolean) => {
    const ws = wsRef.current;
    if (!ws || !readyRef.current || !conversationId) return;
    try {
      ws.send(buildFrame('SEND', { destination: '/app/typing', 'content-type': 'application/json' }, JSON.stringify({ conversationId, typing })));
    } catch (err: any) {
      console.error('[Messages] typing frame failed:', err?.message || err);
    }
  }, []);

  return { connected, sendTyping };
}
