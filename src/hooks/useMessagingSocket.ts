// src/hooks/useMessagingSocket.ts
// Ported from web `useMessagingSocket`.
//
// Real-time receive channel for direct messages. Sends still go over REST
// (POST /v1/messages); this hook opens a STOMP connection, authenticates with
// the JWT in the CONNECT frame (matching the backend's
// StompAuthChannelInterceptor), and streams inbound messages from
// /user/queue/messages to the callback you pass in.
//
// ── Why no @stomp/stompjs + sockjs-client here ──
// The web version uses those libraries, but both are awkward on React Native:
// sockjs-client needs browser globals and @stomp/stompjs pulls in a WebSocket
// polyfill. STOMP is just a small text framing protocol, and React Native
// ships a spec-compliant global `WebSocket`, so we speak STOMP directly over a
// raw WebSocket. This keeps the dependency footprint at zero and behaves
// identically for our one subscription.
//
// NOTE: this connects to the RAW STOMP endpoint (`/ws`), NOT the SockJS
// handshake endpoint. Spring's `registerStompEndpoints` must expose the raw
// endpoint alongside `.withSockJS()` — the common setup is:
//     registry.addEndpoint("/ws").setAllowedOriginPatterns("*");          // raw (mobile)
//     registry.addEndpoint("/ws").setAllowedOriginPatterns("*").withSockJS(); // web
// If your backend only registered `.withSockJS()`, add the raw line (it's the
// same endpoint path, just without the SockJS wrapper). Real-time is additive:
// if the socket can't connect, MessagePage still works via REST polling on
// send/receive — you just won't get live push until this endpoint exists.

import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

// Raw STOMP endpoint (no SockJS). API base is
// https://unismvp-production.up.railway.app/api → strip /api, use wss + /ws.
const API_BASE_URL = 'https://unismvp-production.up.railway.app/api';

function resolveWsUrl(): string {
  const origin = API_BASE_URL.replace(/\/api\/?$/, '');
  // http(s) → ws(s)
  return `${origin.replace(/^http/, 'ws')}/ws`;
}

// ── Minimal STOMP framing ──────────────────────────────────────────────────
const NULL = '\u0000';

function buildFrame(command: string, headers: Record<string, string>, body = ''): string {
  const head = Object.entries(headers)
    .map(([k, v]) => `${k}:${v}`)
    .join('\n');
  return `${command}\n${head}\n\n${body}${NULL}`;
}

interface ParsedFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

function parseFrame(data: string): ParsedFrame | null {
  // Heartbeats arrive as a lone newline.
  if (!data || data === '\n') return null;
  const cleaned = data.replace(/\u0000$/, '');
  const divider = cleaned.indexOf('\n\n');
  const rawHead = divider === -1 ? cleaned : cleaned.slice(0, divider);
  const body = divider === -1 ? '' : cleaned.slice(divider + 2);
  const lines = rawHead.split('\n');
  const command = lines.shift() || '';
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > -1) headers[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return { command, headers, body };
}

export function useMessagingSocket(onMessage: (message: any) => void) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = async () => {
      const token = await SecureStore.getItemAsync('token');
      if (!token || cancelled) return;

      try {
        ws = new WebSocket(resolveWsUrl());
      } catch (_) {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        // STOMP CONNECT with JWT (matches StompAuthChannelInterceptor).
        ws?.send(
          buildFrame('CONNECT', {
            'accept-version': '1.1,1.2',
            Authorization: `Bearer ${token}`,
            'heart-beat': '10000,10000',
          })
        );
      };

      ws.onmessage = (evt) => {
        const frame = parseFrame(String(evt.data));
        if (!frame) return; // heartbeat

        if (frame.command === 'CONNECTED') {
          setConnected(true);
          // Subscribe to the user's personal message queue.
          ws?.send(
            buildFrame('SUBSCRIBE', {
              id: 'sub-messages',
              destination: '/user/queue/messages',
            })
          );
          // Application-level heartbeat to keep the connection warm.
          heartbeatTimer = setInterval(() => {
            try { ws?.send('\n'); } catch (_) { /* closed */ }
          }, 10000);
          return;
        }

        if (frame.command === 'MESSAGE') {
          try {
            handlerRef.current?.(JSON.parse(frame.body));
          } catch (_) {
            /* malformed frame — ignore */
          }
        }
      };

      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 4000); // matches web reconnectDelay
    };

    connect();

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.send(buildFrame('DISCONNECT', {}));
        ws?.close();
      } catch (_) { /* already closed */ }
    };
  }, []);

  return { connected };
}

export default useMessagingSocket;