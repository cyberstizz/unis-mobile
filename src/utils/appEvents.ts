// src/utils/appEvents.ts
// A tiny app-wide event bus — mobile stand-in for web's window CustomEvents
// ('unis:messages-updated', 'unis:blocked-songs-changed', …).
//
//   const off = onAppEvent('messages-updated', load);   // in an effect
//   emitAppEvent('messages-updated');
type Handler = (detail?: any) => void;
const handlers = new Map<string, Set<Handler>>();

export function onAppEvent(name: string, fn: Handler): () => void {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name)!.add(fn);
  return () => { handlers.get(name)?.delete(fn); };
}

export function emitAppEvent(name: string, detail?: any) {
  handlers.get(name)?.forEach((fn) => {
    try { fn(detail); } catch (e) { console.warn(`[appEvents] ${name} handler failed`, e); }
  });
}
