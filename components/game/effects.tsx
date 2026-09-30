"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { GameState } from "@/lib/game-types";

export function useGameSound(state: GameState | null, offset: number, personal = false) {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(true);
  const context = useRef<AudioContext | null>(null);
  const volume = useRef<GainNode | null>(null);
  const toggle = async () => {
    try {
      if (!context.current) {
        const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) { setAvailable(false); return; }
        context.current = new Audio();
        volume.current = context.current.createGain();
        volume.current.connect(context.current.destination);
      }
      await context.current.resume();
      volume.current!.gain.setValueAtTime(enabled ? 0 : 0.16, context.current.currentTime);
      setEnabled(!enabled);
    } catch { setAvailable(false); }
  };
  function note(frequency: number, duration: number, at = 0, shape: OscillatorType = "sine", loudness = .35) {
    const ctx = context.current;
    if (!ctx || !volume.current || document.hidden || ctx.state !== "running") return;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const start = ctx.currentTime + at;
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(loudness, start + .015);
    envelope.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(envelope); envelope.connect(volume.current);
    oscillator.start(start); oscillator.stop(start + duration + .03);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  const phase = state?.game.status;
  const round = state?.game.roundKey;
  const endsAt = state?.game.votingEndsAt;
  const correct = state?.me?.correct;
  useEffect(() => {
    if (!enabled || !phase) return;
    if (phase === "reveal" || phase === "finished") {
      const melody = personal && correct === false ? [329.63, 293.66, 261.63] : [261.63, 329.63, 392, 523.25, 659.25];
      melody.forEach((pitch, i) => note(pitch, .38, (phase === "reveal" ? .95 : 0) + i * .12, "triangle", .55));
    } else if (phase === "results") { note(164.81, .5); note(246.94, .5, .12); }
    else if (phase === "leaderboard") { [392, 523.25, 783.99].forEach((p, i) => note(p, .3, i * .09)); }
    let step = 0, lastSecond = -1;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const seconds = Math.max(0, Math.ceil(((endsAt || 0) - Date.now() - offset) / 1000));
      if (phase === "countdown") {
        if (seconds !== lastSecond) { note(seconds > 35 ? 440 : 880, .12, 0, "sine", .5); lastSecond = seconds; }
      } else if (phase === "voting" && seconds <= 7 && seconds > 0) {
        if (seconds !== lastSecond) { note(740, .09, 0, "triangle", .4); lastSecond = seconds; }
      } else if (!personal && (phase === "lobby" || phase === "voting")) {
        const progression = phase === "lobby" ? [130.81, 196, 164.81, 246.94] : [164.81, 196, 246.94, 293.66];
        if (step % 2 === 0) note(progression[(step / 2) % 4], .2, 0, "triangle", .22);
        if (step % 4 === 0) note(65.41, .2, 0, "sine", .4);
        step++;
      }
    }, 250);
    return () => window.clearInterval(timer);
    // Phase changes trigger a single cue; a poll never restarts the music.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, phase, round, personal]);
  useEffect(() => () => { void context.current?.close(); }, []);
  return { enabled, available, toggle };
}

export type Sound = ReturnType<typeof useGameSound>;
export function SoundButton({ sound }: { sound: Sound }) {
  return <button className={`sound-button ${sound.enabled ? "on" : ""}`} onClick={sound.toggle} aria-pressed={sound.enabled} disabled={!sound.available} title={sound.available ? "Música y efectos" : "Audio no disponible en este navegador"}>
    {sound.enabled ? <Volume2 /> : <VolumeX />}<span>{!sound.available ? "Sin audio" : sound.enabled ? "Sonido activo" : "Activar sonido"}</span>
    {sound.enabled && <i className="equalizer"><b /><b /><b /></i>}
  </button>;
}

export function useRemaining(endsAt: number | null, offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(timer); }, []);
  return Math.max(0, ((endsAt || 0) - now - offset) / 1000);
}

export function Confetti() {
  return <div className="confetti" aria-hidden="true">{Array.from({ length: 34 }, (_, i) => <i key={i} style={{ "--i": i, "--x": `${(i * 43 + 7) % 100}%`, "--delay": `${(i % 7) * .11}s`, "--spin": `${(i % 2 ? 1 : -1) * (180 + i * 19)}deg`, background: ["#c5ff37", "#ff315c", "#9875ff", "#fff"][i % 4] } as CSSProperties} />)}</div>;
}
