"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Check, Copy, Fullscreen, Gamepad2, ImagePlus, LoaderCircle, MonitorPlay, Pencil, Play, Plus, Radio, RotateCcw, Search, Send, Sparkles, Square, Trash2, Trophy, Users, WifiOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NamePicker } from "@/components/game/name-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";
import { SoundButton, useGameSound, type Sound } from "@/components/game/effects";
import { Avatar, Brand, Lobby, Photo, Reveal, Results, RoundIntro, RoundTimer, Scoreboard, Stage, VoteMeter, phaseNames } from "@/components/game/stage";
import { OrganizerLogin } from "@/components/game/organizer-login";
import { organizerAuthHeaders, supabaseBrowser } from "@/lib/supabase-browser";
import { type GameState, type Person, type Phase } from "@/lib/game-types";

type Mode = "home" | "host" | "join" | "screen";
type Creation = { code: string };
type JoinResult = { playerId: string; state: GameState };
type SavedGame = { code: string; title: string; status: Phase; createdAt: string };
type SavedGamesResult = { games: SavedGame[] };
type Refresh = () => Promise<void>;

async function api<T>(body: Record<string, unknown> | FormData): Promise<T> {
  const auth = await organizerAuthHeaders();
  const response = await fetch("/api/game", {
    method: "POST", signal: AbortSignal.timeout(16000),
    ...(body instanceof FormData ? { headers: auth, body } : { headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(body) }),
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "No pudimos completar la acción.");
  return data;
}
const errorText = (error: unknown) => error instanceof Error && error.name !== "TimeoutError" ? error.message : "La conexión está tardando. Intenta de nuevo.";
function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`app-shell ${className}`}><div className="ambient-grid" aria-hidden="true" /><div className="ambient-glow" aria-hidden="true" />{children}<Toaster theme="dark" position="top-center" richColors /></main>;
}
function BusyLabel({ busy, children }: { busy: boolean; children: ReactNode }) { return <>{busy && <LoaderCircle className="spin" />}{children}</>; }
async function copyLink(value: string, success: string) {
  try { await navigator.clipboard.writeText(value); toast.success(success); }
  catch { toast.error("No se pudo copiar. Puedes copiar el enlace desde la barra del navegador."); }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("home");
  const [code, setCode] = useState("");
  const [playerKey, setPlayerKey] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [booted, setBooted] = useState(false);
  const [loading, setLoading] = useState(false);
  const newest = useRef(0);
  const sound = useGameSound(state, offset, mode === "join");

  const enter = useCallback((nextMode: Mode, room: string) => {
    newest.current = 0; setState(null); setError("");
    setMode(nextMode); setCode(room);
    try { setPlayerKey(localStorage.getItem(`player:${room}`) || ""); } catch { setPlayerKey(""); }
    const query = nextMode === "host" ? `?code=${room}&host=1` : nextMode === "screen" ? `?code=${room}&view=screen` : `?code=${room}`;
    window.history.replaceState({}, "", query);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = (params.get("code") || "").trim().toUpperCase();
    if (room) enter(params.has("host") ? "host" : params.get("view") === "screen" ? "screen" : "join", room);
    setBooted(true);
  }, [enter]);

  const apply = useCallback((data: GameState) => {
    if (data.serverTime < newest.current) return;
    newest.current = data.serverTime;
    setState(data); setOffset(data.serverTime - Date.now()); setError("");
  }, []);
  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const response = await fetch(`/api/game?code=${encodeURIComponent(code)}`, { cache: "no-store", signal: AbortSignal.timeout(10000), headers: { ...(await organizerAuthHeaders()), ...(playerKey ? { "x-player-key": playerKey } : {}) } });
      const data = await response.json() as GameState & { error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos conectar con la sala.");
      if (mode === "host" && !data.isHost) throw new Error("Inicia sesión con la cuenta autorizada para abrir la cabina del organizador.");
      apply(data);
    } catch (e) { setError(errorText(e)); }
  }, [code, mode, playerKey, apply]);
  useEffect(() => {
    if (mode === "home" || !code) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => { if (!document.hidden) await refresh(); if (active) timer = setTimeout(poll, 1100); };
    void poll();
    const resume = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume);
    return () => { active = false; clearTimeout(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [mode, code, refresh]);

  const createGame = useCallback(async (title: string, demo = false) => {
    setLoading(true);
    try {
      const result = await api<Creation>({ action: "create", title, demo });
      enter("host", result.code);
      return { code: result.code, status: "created" };
    } catch (e) { toast.error(errorText(e)); throw e; }
    finally { setLoading(false); }
  }, [enter]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: unknown) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({ name: "create_childhood_photo_game", title: "Crear actividad ¿Quién es quién?", description: "Crea una sala vacía y abre su panel del organizador.", inputSchema: { type: "object", properties: { title: { type: "string", minLength: 1, maxLength: 80 } }, required: ["title"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => {
        const title = typeof input === "object" && input && "title" in input && typeof input.title === "string" ? input.title.trim() : "";
        if (!title || title.length > 80) throw new Error("Escribe un título de 1 a 80 caracteres.");
        return createGame(title);
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, [createGame]);

  if (!booted) return <Shell><div className="connecting"><Brand /><LoaderCircle className="spin" /></div></Shell>;
  if (mode === "home") return <Landing onCreate={(title, demo) => { void createGame(title, demo).catch(() => {}); }} onJoin={(room, screen) => enter(screen ? "screen" : "join", room)} onResume={room => enter("host", room)} loading={loading} />;
  if (!state) return <Shell><div className="connection-card"><Brand /><div className="connection-icon">{error ? <WifiOff /> : <LoaderCircle className="spin" />}</div><span className="eyebrow">SALA {code}</span><h1>{error ? "VAMOS A RECONECTAR." : "ENTRANDO AL JUEGO…"}</h1>{error && <><p role="alert">{error}</p><Button className="action lime" onClick={refresh}>Reintentar</Button><Link className="text-button" href="/">Usar otro código</Link></>}{mode === "host" && <div className="entry-panel auth-entry"><OrganizerLogin onAuthenticated={() => { setError(""); void refresh(); }} /></div>}</div></Shell>;
  const notice = error ? <div className="network-notice" role="status"><WifiOff /> Reconectando… Tu respuesta confirmada sigue guardada.<button onClick={refresh}>Reintentar</button></div> : null;
  const shared = { state, offset, sound };
  if (mode === "host") return <HostView {...shared} apply={apply} refresh={refresh} notice={notice} />;
  if (mode === "screen") return <Shell className={`presenter state-${state.game.status}`}><header className="site-header"><Brand /><div className="header-actions"><SoundButton sound={sound} /><button className="icon-button" aria-label="Pantalla completa" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => toast.error("Usa pantalla completa desde tu navegador.")); }}><Fullscreen /></button><div className="header-code"><small>SALA</small><strong>{code}</strong></div></div></header>{notice}<div className="presenter-body"><Stage state={state} offset={offset} /></div><div className="broadcast-footer"><span>{state.game.title}</span><span><Radio /> EN VIVO · {state.players.length} JUGADORES</span></div></Shell>;
  return <PlayerView {...shared} playerKey={playerKey} setPlayerKey={(key) => { setPlayerKey(key); try { localStorage.setItem(`player:${code}`, key); } catch {} }} apply={apply} refresh={refresh} notice={notice} />;
}

function Landing({ onCreate, onJoin, onResume, loading }: { onCreate: (title: string, demo?: boolean) => void; onJoin: (room: string, screen?: boolean) => void; onResume: (room: string) => void; loading: boolean }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("Día del Niño 2026");
  const [organize, setOrganize] = useState(false);
  const [organizerSignedIn, setOrganizerSignedIn] = useState(false);
  const [organizerAuthChecked, setOrganizerAuthChecked] = useState(false);
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [savedGamesLoading, setSavedGamesLoading] = useState(false);

  const loadSavedGames = useCallback(async () => {
    setSavedGamesLoading(true);
    try {
      const result = await api<SavedGamesResult>({ action: "list_games" });
      setSavedGames(result.games);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSavedGamesLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    try {
      const client = supabaseBrowser();
      void client.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
        if (active) {
          setOrganizerSignedIn(Boolean(data.session));
          setOrganizerAuthChecked(true);
        }
      }).catch(() => { if (active) setOrganizerAuthChecked(true); });
      const listener = client.auth.onAuthStateChange((_event: string, session: unknown) => {
        if (active) setOrganizerSignedIn(Boolean(session));
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    } catch {
      setOrganizerAuthChecked(true);
    }
    return () => { active = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (organizerSignedIn) void loadSavedGames();
    else setSavedGames([]);
  }, [organizerSignedIn, loadSavedGames]);

  const organizerContent = !organizerAuthChecked
    ? <div className="connecting"><LoaderCircle className="spin" /><p className="form-hint">Verificando tu sesión…</p></div>
    : organizerSignedIn
      ? <div className="organizer-home">{savedGamesLoading ? <div className="saved-games-loading"><LoaderCircle className="spin" /> Buscando tus salas…</div> : savedGames.length > 0 ? <section className="saved-games"><span className="eyebrow acid">TUS SALAS GUARDADAS</span><div>{savedGames.map(game => <button type="button" className="saved-game" key={game.code} onClick={() => onResume(game.code)}><span><b>{game.title}</b><small>{phaseNames[game.status]}</small></span><strong>{game.code}</strong></button>)}</div><p>Las fotos y tarjetas permanecen guardadas en Supabase.</p></section> : null}<form onSubmit={event => { event.preventDefault(); onCreate(title); }}><span className="eyebrow">{savedGames.length ? "CREAR OTRA ACTIVIDAD" : "TÚ PONES LAS FOTOS"}</span><h2>QUE EMPIECE<br />EL SHOW.</h2><label htmlFor="event-title">Nombre de la actividad</label><input id="event-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required /><Button className="action lime" disabled={loading} type="submit"><BusyLabel busy={loading}>Crear mi actividad</BusyLabel><Plus /></Button><button className="text-button" type="button" disabled={loading} onClick={() => onCreate("Demo · Día del Niño", true)}>Probar con 4 participantes de ejemplo</button><p className="form-hint">Sesión autorizada. Tus salas estarán disponibles cada vez que vuelvas.</p></form></div>
      : <OrganizerLogin onAuthenticated={() => setOrganizerSignedIn(true)} />;

  return <Shell className="welcome"><header className="site-header"><Brand /><span className="header-edition"><Radio /> EL EQUIPO. COMO NUNCA LO HAS VISTO.</span></header><div className="welcome-layout"><section className="welcome-title"><span className="eyebrow acid"><Sparkles /> UN VIAJE A LA INFANCIA</span><h1>CARAS<br />CONOCIDAS.<br /><em>PEQUEÑOS<br />MISTERIOS.</em></h1><div className="welcome-rule"><b>35</b><span>segundos.<br />Una foto. Tu intuición.</span><Zap /></div></section><Tabs className="entry-panel" value={organize ? "organize" : "play"} onValueChange={value => setOrganize(value === "organize")}><TabsList className="entry-tabs"><TabsTrigger value="play"><Gamepad2 /> Voy a jugar</TabsTrigger><TabsTrigger value="organize"><MonitorPlay /> Voy a organizar</TabsTrigger></TabsList>{organize ? <TabsContent value="organize">{organizerContent}</TabsContent> : <TabsContent value="play"><form onSubmit={event => { event.preventDefault(); onJoin(code); }}><span className="eyebrow">¿LISTO PARA ADIVINAR?</span><h2>EL JUEGO<br />TE ESPERA.</h2><label htmlFor="room-code">Código de la sala</label><input className="room-input" id="room-code" autoComplete="off" placeholder="ABC123" value={code} maxLength={6} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /><Button className="action hot" disabled={code.length !== 6} type="submit">Entrar al juego <Gamepad2 /></Button><button type="button" className="text-button" disabled={code.length !== 6} onClick={() => onJoin(code, true)}><MonitorPlay /> Abrir pantalla de presentación</button><p className="form-hint">Sin registros. Solo tu nombre y ganas de jugar.</p></form></TabsContent>}<div className="entry-bottom"><span><Users /> JUNTOS, EN VIVO</span><span><Trophy /> 1,000 PTS POR ACIERTO</span></div></Tabs></div><footer className="welcome-footer"><span>FOTOS DE ANTES. RISAS DE AHORA.</span><span>DÍA DEL NIÑO / 2026</span></footer></Shell>;
}

function HostView({ state, apply, refresh, offset, sound, notice }: { state: GameState; apply: (data: GameState) => void; refresh: Refresh; offset: number; sound: Sound; notice: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Person | "new" | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const code = state.game.code, phase = state.game.status;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const doAction = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try { apply(await api<GameState>({ ...body, code, roundKey: state.game.roundKey, expectedPhase: phase })); }
    catch (e) { toast.error(errorText(e)); await refresh(); }
    finally { setBusy(false); }
  };
  const nextLast = state.game.currentRound + 1 >= state.participants.length;
  const controls = phase === "lobby" ? { command: "start", label: "Empezar el show", icon: <Play /> }
    : phase === "countdown" ? { command: "", label: "Preparando la ronda…", icon: <LoaderCircle className="spin" /> }
    : phase === "voting" ? { command: "close", label: state.voteCount >= state.players.length && state.players.length ? "Todos listos · Ver votos" : "Cerrar y ver votos", icon: <Square /> }
    : phase === "results" ? { command: "reveal", label: "Revelar identidad", icon: <Sparkles /> }
    : phase === "reveal" ? { command: "leaderboard", label: "Mostrar marcador", icon: <BarChart3 /> }
    : phase === "leaderboard" ? { command: "next", label: nextLast ? "Ver el gran final" : "Siguiente foto", icon: nextLast ? <Trophy /> : <Play /> }
    : { command: "reset", label: "Volver a preparar", icon: <RotateCcw /> };
  return <Shell className="host-shell"><header className="site-header"><Brand /><div className="header-actions"><SoundButton sound={sound} /><div className="header-code"><small>SALA</small><strong>{code}</strong></div></div></header>{notice}<div className="host-layout"><aside className="host-sidebar"><span className="eyebrow">CABINA DEL PRESENTADOR</span><h1>{state.game.title}</h1><div className="host-steps">{["Prepara las fotos", "Juega con tu equipo", "Celebra el resultado"].map((text, index) => <div className={(phase === "lobby" ? 0 : phase === "finished" ? 2 : 1) === index ? "active" : ""} key={text}><span>0{index + 1}</span><b>{text}</b></div>)}</div><div className="host-tools"><Button className="action outline" onClick={() => window.open(`?code=${code}&view=screen`, "_blank", "noopener")}><MonitorPlay /> Abrir pantalla</Button><Button className="action outline" onClick={() => copyLink(`${base}?code=${code}`, "Enlace para los jugadores copiado.")}><Copy /> Invitar jugadores</Button><button className="text-button" onClick={() => copyLink(`${base}?code=${code}&host=1`, "Enlace de cabina copiado. Necesitará tu inicio de sesión.")}>Guardar mi enlace de cabina</button></div><div className="host-tip"><Zap /><p>Proyecta la pantalla de presentación y controla el ritmo desde aquí.</p></div></aside><div className="host-workspace">{phase === "lobby" ? <><div className="workspace-heading"><div><span className="eyebrow acid">PREPARACIÓN</span><h2>CADA FOTO,<br />UNA SORPRESA.</h2></div><Button className="action lime" onClick={() => setEdit("new")}><Plus /> Agregar persona</Button></div><div className="setup-stats"><span><ImagePlus /><b>{state.participants.length}</b> fotos / rondas</span><span><Users /><b>{state.players.length}</b> jugadores en la sala</span><span><Zap /><b>35 s</b> por ronda</span></div><div className="participant-grid">{state.participants.map((person, i) => <article className="participant-card" key={person.id}><div className="participant-image"><Photo url={person.photoUrl} /><span className="participant-index">#{String(i + 1).padStart(2, "0")}</span></div><div className="participant-info"><h3>{person.name}</h3><p>{person.description}</p><div><button onClick={() => setEdit(person)}><Pencil /> Editar</button><button className="delete-button" onClick={() => setDeleting(person)} aria-label={`Eliminar a ${person.name}`}><Trash2 /></button></div></div></article>)}{!state.participants.length && <button className="empty-upload" onClick={() => setEdit("new")}><ImagePlus /><h3>El primer recuerdo va aquí.</h3><p>Agrega una foto, el nombre y una pista de su infancia.</p><span>Agregar mi primera persona</span></button>}</div>{state.players.length > 0 && <div className="setup-players"><span className="eyebrow">YA ESTÁN LISTOS</span><div className="player-cloud">{state.players.map((p, i) => <span className="player-pill" key={p.id}><Avatar name={p.name} index={i} />{p.name}</span>)}</div></div>}</> : <Stage state={state} offset={offset} host />}</div></div><div className="host-control-bar"><div><span className="eyebrow">{phase === "lobby" ? "¿TODO PREPARADO?" : `RONDA ${state.game.currentRound + 1} / ${state.participants.length}`}</span><b>{phase === "lobby" ? state.participants.length < 2 ? "Agrega al menos dos personas" : "Invita al equipo y comienza" : phaseNames[phase]}</b></div><div className="control-buttons">{phase === "reveal" && <Button className="action outline" disabled={busy} onClick={() => doAction({ action: "control", command: "next" })}>{nextLast ? "Ir al final" : "Siguiente foto"}</Button>}<Button className="action hot" disabled={busy || !controls.command || (phase === "lobby" && state.participants.length < 2)} onClick={() => phase === "finished" ? setResetOpen(true) : doAction({ action: "control", command: controls.command })}><BusyLabel busy={busy}>{controls.icon}{controls.label}</BusyLabel></Button></div></div>
    <ParticipantEditor person={edit} code={code} onClose={() => setEdit(null)} onSaved={apply} />
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}><AlertDialogContent className="game-dialog"><AlertDialogHeader><AlertDialogTitle>¿Eliminar a {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>Se quitarán su foto y su pista de esta actividad.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Conservar</AlertDialogCancel><AlertDialogAction onClick={() => doAction({ action: "delete_participant", participantId: deleting?.id })}>Eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={resetOpen} onOpenChange={setResetOpen}><AlertDialogContent className="game-dialog"><AlertDialogHeader><AlertDialogTitle>¿Preparar otra partida?</AlertDialogTitle><AlertDialogDescription>Se conservarán las fotos y los jugadores. Se borrarán los votos y puntos de esta partida.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Conservar marcador</AlertDialogCancel><AlertDialogAction onClick={() => doAction({ action: "control", command: "reset" })}>Preparar otra partida</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Shell>;
}

function ParticipantEditor({ person, code, onClose, onSaved }: { person: Person | "new" | null; code: string; onClose: () => void; onSaved: (state: GameState) => void }) {
  const [busy, setBusy] = useState(false), [fileName, setFileName] = useState("");
  const [descriptionLength, setDescriptionLength] = useState(0);
  useEffect(() => {
    setFileName("");
    setDescriptionLength(person && person !== "new" ? person.description?.length || 0 : 0);
  }, [person]);
  const existing = person && person !== "new" ? person : null;
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true);
    const form = new FormData(e.currentTarget); form.set("action", existing ? "edit_participant" : "add_participant"); form.set("code", code);
    if (existing) form.set("participantId", existing.id);
    try { onSaved(await api<GameState>(form)); onClose(); toast.success(existing ? "Recuerdo actualizado." : "¡Una foto más para el juego!"); }
    catch (error) { toast.error(errorText(error)); }
    finally { setBusy(false); }
  };
  return <Dialog open={!!person} onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="game-dialog editor-dialog"><DialogHeader><DialogTitle>{existing ? "Edita este recuerdo" : "Agrega un recuerdo"}</DialogTitle><DialogDescription>El nombre se mantendrá oculto hasta la revelación.</DialogDescription></DialogHeader><form key={existing?.id || "new"} onSubmit={save}><label className="upload-zone"><ImagePlus /><b>{fileName || (existing?.photoUrl ? "Cambiar foto de infancia" : "Seleccionar foto de infancia")}</b><span>JPG, PNG, WEBP o GIF · máximo 8 MB</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setFileName(e.target.files?.[0]?.name || "")} /></label><label htmlFor="person-name">Nombre de la persona</label><input id="person-name" name="name" required maxLength={60} defaultValue={existing?.name || ""} placeholder="Ej. Andrea López" /><label htmlFor="person-description">Una pista de su infancia</label><textarea id="person-description" name="description" required maxLength={3000} defaultValue={existing?.description || ""} onChange={e => setDescriptionLength(e.target.value.length)} placeholder="¿Qué le gustaba hacer? ¿Cómo era? ¿Qué soñaba ser?" rows={4} /><span className="character-count">{descriptionLength.toLocaleString("es-GT")} / 3,000 caracteres</span><Button className="action lime" type="submit" disabled={busy}><BusyLabel busy={busy}>{existing ? "Guardar cambios" : "Agregar al juego"}</BusyLabel></Button></form></DialogContent></Dialog>;
}

function PlayerView({ state, offset, sound, playerKey, setPlayerKey, apply, refresh, notice }: { state: GameState; offset: number; sound: Sound; playerKey: string; setPlayerKey: (key: string) => void; apply: (state: GameState) => void; refresh: Refresh; notice: ReactNode }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [popupOpen, setPopupOpen] = useState(false);
  const code = state.game.code, phase = state.game.status;
  useEffect(() => { setSelected(null); setInlineError(""); }, [state.game.roundKey]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [state.game.status, state.game.roundKey, state.me?.voteParticipantId]);
  const join = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setInlineError("");
    try { const result = await api<JoinResult>({ action: "join", code, name, playerKey }); setPlayerKey(result.playerId); apply(result.state); }
    catch (error) { setInlineError(errorText(error)); }
    finally { setBusy(false); }
  };
  const vote = async () => {
    if (!selected || busy) return; setBusy(true); setInlineError("");
    try {
      apply(await api<GameState>({ action: "vote", code, playerId: playerKey, participantId: selected.id, roundIndex: state.game.currentRound, roundKey: state.game.roundKey }));
      navigator.vibrate?.([35, 40, 35]);
    } catch (error) { setInlineError(errorText(error)); await refresh(); }
    finally { setBusy(false); }
  };
  if (!state.me) return <Shell className="phone-shell"><header className="phone-header"><Brand compact /><span className="phone-code">{code}</span></header>{notice}<form className="join-card" onSubmit={join}><span className="join-icon"><Gamepad2 /></span><span className="eyebrow acid">YA CASI ESTÁS DENTRO</span><h1>EL EQUIPO<br />TE ESPERA.</h1><p>¿Cómo te llamas? Así aparecerás en el marcador.</p><label htmlFor="player-name">Tu nombre</label><input id="player-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Carlos" autoComplete="given-name" maxLength={40} required />{inlineError && <p className="inline-error" role="alert">{inlineError}</p>}<Button type="submit" className="action hot" disabled={!name.trim() || busy}><BusyLabel busy={busy}>Estoy listo <Zap /></BusyLabel></Button><span className="join-count"><Users /> {state.players.length} personas en la sala</span></form></Shell>;
  const votedFor = state.participants.find(person => person.id === state.me?.voteParticipantId);
  return <Shell className={`phone-shell state-${phase} ${state.me.correct ? "answer-right" : ""}`}><header className="phone-header"><Brand compact /><span className="phone-score"><Trophy />{state.me.score.toLocaleString("es-GT")}<small>PTS</small></span></header>{notice}<div className="player-toolbar"><span>HOLA, <b>{state.me.name}</b></span><SoundButton sound={sound} /></div><div className="phone-content">
    {phase === "lobby" ? <Lobby state={state} personal /> : phase === "countdown" ? <RoundIntro state={state} offset={offset} /> : phase === "leaderboard" || phase === "finished" ? <Scoreboard state={state} final={phase === "finished"} personal /> : <div className={`phone-round state-${phase} ${state.me.voteParticipantId ? "has-vote" : ""}`} key={state.game.roundKey}><div className="phone-round-heading"><div><span className="eyebrow">RONDA {state.game.currentRound + 1} DE {state.participants.length}</span><h1>{phase === "voting" ? "¿QUIÉN ES?" : phase === "results" ? "¿HABRÁS ACERTADO?" : "MISTERIO RESUELTO."}</h1></div>{phase === "voting" && <RoundTimer endsAt={state.game.votingEndsAt} offset={offset} compact />}</div><Progress className="round-progress" value={(state.game.currentRound + 1) / Math.max(1, state.participants.length) * 100} /><div className="phone-memory"><Photo url={state.current?.photoUrl} /><p>“{state.current?.description}”</p></div>
      {phase === "voting" ? state.me.voteParticipantId ? <div className="vote-confirmed" role="status"><div className="confirmed-check"><Check /></div><span className="eyebrow">RESPUESTA CONFIRMADA</span><h2>{votedFor?.name}</h2><p>Ya hiciste tu apuesta.<br />Ahora viene lo bueno.</p><VoteMeter state={state} /><i className="waiting-dots"><b /><b /><b /></i></div> : <div className="vote-form"><label htmlFor="guess-name"><Search /> ¿A quién reconoces?</label><NamePicker people={state.participants} selected={selected} onSelect={setSelected} onOpenChange={setPopupOpen} /><div className="choice-preview" aria-live="polite">{selected ? <>Tu elección: <strong>{selected.name}</strong></> : "Selecciona un nombre antes de confirmar."}</div>{inlineError && <p className="inline-error" role="alert">{inlineError}</p>}<Button className="action hot vote-submit" disabled={!selected || busy || popupOpen} onClick={vote}><BusyLabel busy={busy}>{busy ? "Enviando tu respuesta…" : "Confirmar respuesta"}<Send /></BusyLabel></Button><p className="form-hint">Una respuesta por ronda. ¡Confía en tu intuición!</p></div> : phase === "results" ? <div className="phone-results"><Results state={state} />{votedFor && <p className="your-answer">Tu respuesta: <b>{votedFor.name}</b></p>}</div> : <><Reveal state={state} personal /><div className="personal-standing"><span>TU MARCADOR<strong>{state.me.score.toLocaleString("es-GT")} <small>PTS</small></strong></span><span>TU PUESTO<strong>#{state.me.rank}</strong></span></div><p className="next-wait">Prepárate. La siguiente sorpresa viene en camino.</p></>}
    </div>}
  </div></Shell>;
}
