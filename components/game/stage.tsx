"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Baby, Check, Crown, Eye, ScanFace, Sparkles, Timer, Trophy, Users, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Confetti, useRemaining } from "./effects";
import { ROUND_SECONDS, type GameState } from "@/lib/game-types";

export const phaseNames: Record<string, string> = { lobby: "Sala de espera", countdown: "Prepárate", voting: "Votación abierta", results: "Votación cerrada", reveal: "La gran revelación", leaderboard: "Así va el equipo", finished: "El gran final" };

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand ${compact ? "compact" : ""}`} href="/" aria-label="¿Quién es quién? Inicio"><span className="brand-mark"><ScanFace /></span><span><b>¿QUIÉN ES QUIÉN<span className="brand-question">?</span></b><small>DÍA DEL NIÑO · EDICIÓN EQUIPO</small></span></Link>;
}

export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return <span className={`player-avatar color-${index % 4}`}>{name.slice(0, 1).toLocaleUpperCase("es")}</span>;
}

export function Lobby({ state, personal = false }: { state: GameState; personal?: boolean }) {
  return <section className={`lobby-stage ${personal ? "personal-lobby" : ""}`}>
    <div className="lobby-title"><span className="eyebrow acid"><span className="live-dot" /> EL EQUIPO SE ESTÁ REUNIENDO</span><h1>{personal ? <>YA ESTÁS <em>DENTRO.</em></> : <>TODOS FUIMOS<br /><em>PEQUEÑOS.</em></>}</h1><p>{personal ? `${state.me?.name}, prepara tu mejor intuición.` : "Hoy descubrimos quién era quién."}</p></div>
    <div className="room-ticket"><span>CÓDIGO DE SALA</span><strong>{state.game.code}</strong><small>{personal ? "El juego comienza en unos momentos" : "Abre el enlace en tu teléfono y entra con tu nombre"}</small></div>
    <div className="lobby-people"><div className="lobby-counter"><Users /><strong key={state.players.length}>{state.players.length}</strong><span>{state.players.length === 1 ? "persona lista" : "personas listas"}</span><i className="waiting-dots"><b /><b /><b /></i></div><div className="player-cloud" aria-live="polite">{state.players.map((p, i) => <span className={`player-pill color-${i % 4}`} key={p.id}><Avatar name={p.name} index={i} />{p.name}<Check /></span>)}</div>{!state.players.length && <p className="muted">Los nombres aparecerán aquí cuando entren.</p>}</div>
    <div className="rules-strip"><span><Eye /> Mira la foto</span><span><Zap /> Confirma tu respuesta</span><span><Trophy /> 1,000 puntos por acierto</span></div>
  </section>;
}

export function RoundIntro({ state, offset }: { state: GameState; offset: number }) {
  const seconds = useRemaining(state.game.votingEndsAt ? state.game.votingEndsAt - ROUND_SECONDS * 1000 : null, offset);
  const count = Math.min(3, Math.ceil(seconds));
  return <section className="round-intro" aria-live="polite"><div className="intro-outline" aria-hidden="true">RONDA {String(state.game.currentRound + 1).padStart(2, "0")}</div><span className="eyebrow acid">RONDA {state.game.currentRound + 1} DE {state.participants.length}</span><h1>OJOS EN LA FOTO.</h1><strong key={count} className="count-number">{count || "¡YA!"}</strong><p>¿A quién vas a reconocer?</p></section>;
}

export function RoundTimer({ endsAt, offset, compact = false }: { endsAt: number | null; offset: number; compact?: boolean }) {
  const left = useRemaining(endsAt, offset);
  const seconds = Math.min(ROUND_SECONDS, Math.ceil(left));
  return <div className={`round-timer ${compact ? "compact-timer" : ""} ${seconds <= 7 ? "urgent" : ""}`} role="timer" aria-label={`${seconds} segundos restantes`}>
    <div className="timer-face" style={{ "--time": `${Math.min(100, left / ROUND_SECONDS * 100)}%` } as CSSProperties}><Timer /><strong>{seconds}</strong><span>SEG</span></div>
    {!compact && <div className="timer-track"><span>{seconds === 0 ? "Cerrando votación…" : seconds <= 7 ? "¡Últimos segundos!" : "Confía en tu primera impresión"}</span><Progress value={Math.min(100, left / ROUND_SECONDS * 100)} /></div>}
  </div>;
}

export function VoteMeter({ state }: { state: GameState }) {
  const total = state.players.length;
  return <div className="vote-meter"><Users /><strong key={state.voteCount}>{state.voteCount}<span> / {total}</span></strong><span>{state.voteCount >= total && total > 0 ? "¡Todos respondieron!" : "respuestas confirmadas"}</span><div className="vote-meter-track"><i style={{ width: `${total ? Math.min(100, state.voteCount / total * 100) : 0}%` }} /></div></div>;
}

export function Photo({ url, large = false }: { url?: string | null; large?: boolean }) {
  return <div className={`photo-window ${large ? "large-photo" : ""}`}>{url ? <img src={url} alt="Foto de infancia de la ronda actual" /> : <div className="photo-placeholder"><Baby /><strong>FOTO POR DESCUBRIR</strong><span>Ronda de práctica</span></div>}<div className="photo-corners" aria-hidden="true" /></div>;
}

export function Results({ state }: { state: GameState }) {
  const rows = state.results.map(row => ({ ...row, name: state.participants.find(p => p.id === row.participantId)?.name || "Participante" }));
  return <div className="results-panel"><div className="results-header"><span className="eyebrow">EL EQUIPO PIENSA QUE ES…</span><b>{state.voteCount} votos</b></div><div className="result-bars">{rows.map((row, i) => <div className="result-bar" key={row.participantId} style={{ "--delay": `${i * .09}s` } as CSSProperties}><div><b>{row.name}</b><span>{Math.round(Number(row.count) / Math.max(1, state.voteCount) * 100)}% <small>({row.count})</small></span></div><i><span className={`bar-fill color-${i % 4}`} style={{ width: `${Number(row.count) / Math.max(1, state.voteCount) * 100}%` }} /></i></div>)}{!rows.length && <p className="muted">No se recibieron votos en esta ronda.</p>}</div><p className="results-suspense"><Sparkles /> La identidad está a punto de revelarse.</p></div>;
}

export function Reveal({ state, personal = false }: { state: GameState; personal?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setReady(true), 950); return () => window.clearTimeout(timer); }, []);
  if (!ready) return <div className="reveal-suspense" role="status"><span>Y LA RESPUESTA ES…</span><b>?</b><i className="waiting-dots"><b /><b /><b /></i></div>;
  const guessed = state.me?.voteParticipantId;
  const correct = state.me?.correct;
  const right = state.results.find(row => row.participantId === state.correctId)?.count || 0;
  return <div className={`reveal-card ${personal && !correct ? "missed" : ""}`}><Confetti /><span className="eyebrow">{personal ? (correct ? "¡LO SABÍAS!" : guessed ? "¡CASI! LA RESPUESTA ERA…" : "LA RESPUESTA ERA…") : "IDENTIDAD DESCUBIERTA"}</span><h2>{state.current?.name}</h2>{personal ? <div className="answer-feedback">{correct ? <><Check /><b>+1,000</b><span>puntos para ti</span></> : <><Eye /><b>{guessed ? "Sigue tu intuición" : "A la próxima"}</b><span>{guessed ? "La próxima foto puede ser tuya." : "No confirmaste una respuesta en esta ronda."}</span></>}</div> : <div className="reveal-stat"><Check /><strong>{right}</strong><span>{right === 1 ? "persona acertó" : "personas acertaron"}</span></div>}</div>;
}

export function Scoreboard({ state, final = false, personal = false }: { state: GameState; final?: boolean; personal?: boolean }) {
  const scored = state.scores.some(player => player.score > 0);
  const tied = state.scores.filter(player => player.rank === 1).length > 1;
  return <section className={`scoreboard ${personal ? "personal-board" : ""}`}>
    {final && scored && <Confetti />}
    <div className="scoreboard-title"><span className="trophy-badge"><Trophy /></span><span className="eyebrow acid">{final ? "EL GRAN FINAL" : "CADA FOTO CUENTA"}</span><h1>{final ? scored ? tied ? "¡TENEMOS EMPATE!" : "¡TENEMOS GANADOR!" : "¡GRACIAS, EQUIPO!" : "ASÍ VA EL JUEGO."}</h1>{personal && state.me && <p>Vas en el puesto <b>#{state.me.rank}</b> con <b>{state.me.score.toLocaleString("es-GT")} puntos</b>.</p>}</div>
    {final && scored && <div className="winner-name">{state.scores.filter(p => p.rank === 1).map(p => p.name).join(" · ")}</div>}
    <div className="score-list">{state.scores.map((player, index) => <div key={player.id} className={`score-row ${player.rank === 1 && scored ? "leader" : ""} ${player.id === state.me?.id ? "you" : ""}`} style={{ "--delay": `${Math.min(index, 7) * .07}s` } as CSSProperties}><span className="rank">{player.rank === 1 && scored ? <Crown /> : String(player.rank).padStart(2, "0")}</span><Avatar name={player.name} index={index} /><b>{player.name}{player.id === state.me?.id && <small>TÚ</small>}</b><strong>{player.score.toLocaleString("es-GT")}<small>PTS</small></strong></div>)}{!state.scores.length && <p className="muted">Todavía no hay jugadores en el marcador.</p>}</div>
    <p className="score-footnote">1,000 puntos por acierto · Los empates comparten puesto</p>
  </section>;
}

export function Stage({ state, offset, host = false }: { state: GameState; offset: number; host?: boolean }) {
  const phase = state.game.status;
  if (phase === "lobby") return <Lobby state={state} />;
  if (phase === "countdown") return <RoundIntro state={state} offset={offset} />;
  if (phase === "leaderboard" || phase === "finished") return <Scoreboard state={state} final={phase === "finished"} />;
  return <section className={`game-stage ${host ? "host-stage" : ""}`} key={state.game.roundKey}>
    <div className="stage-header"><span className="round-tag">RONDA <b>{String(state.game.currentRound + 1).padStart(2, "0")}</b><small>/ {state.participants.length}</small></span><span className={`phase-tag phase-${phase}`}>{phase === "voting" && <span className="live-dot" />}{phaseNames[phase]}</span></div>
    <div className="stage-grid"><div className="stage-photo"><Photo url={state.current?.photoUrl} large /><span className="photo-badge"><ScanFace /> ¿LO RECONOCES?</span></div><div className="stage-content"><span className="eyebrow">EN ESA ÉPOCA…</span><blockquote>“{state.current?.description}”</blockquote><div className="phase-content" key={phase}>{phase === "voting" ? <><RoundTimer endsAt={state.game.votingEndsAt} offset={offset} /><div className="stage-instruction">Escribe un nombre en tu teléfono.<br /><b>Tu equipo está lleno de sorpresas.</b></div></> : phase === "results" ? <Results state={state} /> : <Reveal state={state} />}</div></div></div>
    {phase === "voting" && <VoteMeter state={state} />}
  </section>;
}
