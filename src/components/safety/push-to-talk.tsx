"use client";
import { Mic, MicOff, Phone, Radio } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { pttEnabled } from "@/lib/config";
import { cn } from "@/lib/utils";

type Status = "idle" | "connecting" | "connected" | "failed";

/**
 * Hold-to-talk between a teen and their parent (LiveKit, audio only, user-initiated).
 * Status is truthful: "connected" only after the room connects, and "listening" only when the other side is in the room.
 * Nothing is recorded or stored.
 */
export function PushToTalk({ teenId, otherLabel, callHref }: { teenId: string; otherLabel: string; callHref?: string | null }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [others, setOthers] = useState(0);
  const [talking, setTalking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const room = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);

  const disconnect = useCallback(() => { room.current?.disconnect(); room.current = null; setStatus("idle"); setOthers(0); setTalking(false); setHearing(false); }, []);
  useEffect(() => disconnect, [disconnect]);

  const connect = async () => {
    setStatus("connecting"); setError(null);
    try {
      const r = await fetch("/api/ptt/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ teen_id: teenId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't connect.");
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const rm = new Room({ adaptiveStream: false, dynacast: false });
      const count = () => setOthers(rm.remoteParticipants.size);
      rm.on(RoomEvent.ParticipantConnected, count).on(RoomEvent.ParticipantDisconnected, count)
        .on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === Track.Kind.Audio) { const el = track.attach(); audioBox.current?.appendChild(el); } })
        .on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); })
        .on(RoomEvent.ActiveSpeakersChanged, (sp) => setHearing(sp.some((p) => p.identity !== rm.localParticipant.identity)))
        .on(RoomEvent.Disconnected, () => { setStatus("idle"); setOthers(0); setTalking(false); });
      await rm.connect(j.url, j.token);
      room.current = rm;
      count();
      setStatus("connected");
    } catch (e) {
      setStatus("failed");
      setError((e as Error).message.includes("Permission") ? "Microphone permission was denied." : (e as Error).message);
    }
  };

  const press = async () => {
    if (!room.current) return;
    try { await room.current.localParticipant.setMicrophoneEnabled(true); setTalking(true); }
    catch { setError("Microphone unavailable or permission denied."); setTalking(false); }
  };
  const release = async () => { setTalking(false); await room.current?.localParticipant.setMicrophoneEnabled(false).catch(() => undefined); };

  if (!pttEnabled) {
    return (
      <div className="rounded-2xl border border-navy-100 bg-white p-3 text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-navy-500"><Radio className="h-4 w-4" aria-hidden="true" /> Push-to-talk unavailable</p>
        <p className="mt-0.5 text-xs text-navy-400">Not set up on this site yet.{callHref ? " Use a phone call instead." : ""}</p>
        {callHref && <a href={callHref} className="btn-outline btn-sm mt-2"><Phone className="h-4 w-4" aria-hidden="true" /> Call {otherLabel}</a>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold"><Radio className="h-4 w-4" aria-hidden="true" /> Push-to-talk with {otherLabel}</p>
        <span role="status" className={cn("text-xs", status === "connected" ? "text-emerald-700" : status === "failed" ? "text-coral-700" : "text-navy-400")}>
          {status === "idle" ? "Not connected" : status === "connecting" ? "Connecting…" : status === "failed" ? "Connection failed" : others ? `${otherLabel} is connected` : `Connected — ${otherLabel} hasn't joined`}
        </span>
      </div>
      {error && <p className="mt-1 text-xs text-coral-700">{error}</p>}
      {status !== "connected" ? (
        <button type="button" className="btn-outline btn-sm mt-2" disabled={status === "connecting"} onClick={connect}>{status === "failed" ? "Try again" : "Connect"}</button>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={talking}
            onPointerDown={press} onPointerUp={release} onPointerLeave={() => talking && release()} onPointerCancel={release}
            onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !talking) { e.preventDefault(); press(); } }} onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") release(); }}
            className={cn("flex h-16 flex-1 select-none items-center justify-center gap-2 rounded-2xl text-base font-bold text-white touch-none", talking ? "bg-coral-600" : "bg-navy-800")}>
            {talking ? <Mic className="h-5 w-5" aria-hidden="true" /> : <MicOff className="h-5 w-5" aria-hidden="true" />}{talking ? "Talking…" : "Hold to talk"}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={disconnect}>Leave</button>
        </div>
      )}
      {hearing && <p className="mt-1 text-xs font-semibold text-emerald-700">{otherLabel} is talking…</p>}
      {callHref && <a href={callHref} className="link mt-2 inline-flex items-center gap-1 text-xs"><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Or call {otherLabel}</a>}
      <p className="mt-1 text-[11px] text-navy-400">Audio is not recorded or stored.</p>
      <div ref={audioBox} className="hidden" aria-hidden="true" />
    </div>
  );
}
