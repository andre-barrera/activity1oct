import { deletePhoto, supabaseAdmin } from "@/lib/supabase-admin";
import { INTRO_SECONDS, POINTS, ROUND_SECONDS, type GameState, type Phase } from "@/lib/game-types";
import { photoUrlFor } from "@/lib/photo-security";

export const runtime = "nodejs";

type GameRow = {
  id: string;
  owner_id: string | null;
  code: string;
  title: string;
  host_key: string;
  status: Phase;
  current_round: number;
  voting_ends_at: number | null;
};

type PersonRow = {
  id: string;
  name: string;
  description: string;
  photo_path: string | null;
  sort_order: number;
};

type PlayerRow = { id: string; name: string; joined_at: string };
type VoteRow = { player_id: string; guess_participant_id: string; round_index?: number };
type AuthUser = { id: string; email: string | null };

const id = () => crypto.randomUUID();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => alphabet[value % alphabet.length]).join("");
const roundKey = (game: GameRow) => `${game.current_round}:${game.voting_ends_at || 0}`;
const roundEnd = () => Date.now() + (ROUND_SECONDS + INTRO_SECONDS) * 1000;
const answerVisible = (status: Phase) => ["reveal", "leaderboard", "finished"].includes(status);

async function getGame(roomCode: string) {
  const { data, error } = await supabaseAdmin()
    .from("games")
    .select("id,owner_id,code,title,host_key,status,current_round,voting_ends_at")
    .eq("code", roomCode.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return (data as GameRow | null) ?? null;
}

async function advanceClock(roomCode: string) {
  let game = await getGame(roomCode);
  if (!game) return null;

  const now = Date.now();
  const next: Phase | null = game.voting_ends_at && now >= game.voting_ends_at
    ? "results"
    : game.voting_ends_at && now >= game.voting_ends_at - ROUND_SECONDS * 1000
      ? "voting"
      : null;

  if (next && (game.status === "countdown" || game.status === "voting") && next !== game.status) {
    const { error } = await supabaseAdmin()
      .from("games")
      .update({ status: next })
      .eq("id", game.id)
      .eq("status", game.status)
      .eq("current_round", game.current_round)
      .eq("voting_ends_at", game.voting_ends_at);
    if (error) throw error;
    game = await getGame(roomCode);
  }

  return game;
}

async function authenticatedUser(request: Request): Promise<AuthUser | null> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

async function organizerFromRequest(request: Request): Promise<AuthUser | null> {
  const user = await authenticatedUser(request);
  const allowedId = process.env.ORGANIZER_USER_ID?.trim();
  const allowedEmail = process.env.ORGANIZER_EMAIL?.trim().toLowerCase();
  if (!user || (!allowedId && !allowedEmail)) return null;
  if (allowedId && user.id !== allowedId) return null;
  if (allowedEmail && user.email?.toLowerCase() !== allowedEmail) return null;
  return user;
}

async function requireOwner(roomCode: string, ownerId: string) {
  const game = await advanceClock(roomCode);
  return game && ownerId && game.owner_id === ownerId ? game : null;
}

async function digestSecret(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function normalizeParticipantOrder(gameId: string) {
  const client = supabaseAdmin();
  const result = await client.from("participants").select("id").eq("game_id", gameId).order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (result.error) throw result.error;
  await Promise.all((result.data || []).map((participant: { id: string }, index: number) =>
    client.from("participants").update({ sort_order: index }).eq("id", participant.id).eq("game_id", gameId),
  ));
}

async function publicId(gameId: string, playerId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${gameId}:${playerId}`));
  return Array.from(new Uint8Array(digest).slice(0, 12), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function stateFor(roomCode: string, ownerId = "", playerKey = ""): Promise<GameState | null> {
  const serverTime = Date.now();
  const game = await advanceClock(roomCode);
  if (!game) return null;

  const isHost = Boolean(ownerId && game.owner_id === ownerId);
  const showAnswer = answerVisible(game.status);
  const scoredThrough = showAnswer ? game.current_round : game.current_round - 1;
  const client = supabaseAdmin();

  const [peopleResult, playersResult, currentVotesResult, scoreVotesResult] = await Promise.all([
    client.from("participants").select("id,name,description,photo_path,sort_order").eq("game_id", game.id).order("sort_order", { ascending: true }).order("id", { ascending: true }),
    client.from("players").select("id,name,joined_at").eq("game_id", game.id).order("joined_at", { ascending: true }).order("id", { ascending: true }),
    client.from("votes").select("player_id,guess_participant_id").eq("game_id", game.id).eq("round_index", game.current_round),
    scoredThrough >= 0
      ? client.from("votes").select("player_id,guess_participant_id,round_index").eq("game_id", game.id).lte("round_index", scoredThrough)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (peopleResult.error) throw peopleResult.error;
  if (playersResult.error) throw playersResult.error;
  if (currentVotesResult.error) throw currentVotesResult.error;
  if (scoreVotesResult.error) throw scoreVotesResult.error;

  const people = (peopleResult.data || []) as PersonRow[];
  const joined = (playersResult.data || []) as PlayerRow[];
  const currentVotes = (currentVotesResult.data || []) as VoteRow[];
  const scoreVotes = (scoreVotesResult.data || []) as VoteRow[];
  const answerByRound = new Map(people.map((person) => [person.sort_order, person.id]));

  const groupedMap = new Map<string, number>();
  for (const vote of currentVotes) groupedMap.set(vote.guess_participant_id, (groupedMap.get(vote.guess_participant_id) || 0) + 1);
  const grouped = [...groupedMap.entries()]
    .map(([participantId, count]) => ({ participantId, count }))
    .sort((a, b) => b.count - a.count || a.participantId.localeCompare(b.participantId));

  const totalScores = new Map(joined.map((player) => [player.id, 0]));
  for (const vote of scoreVotes) {
    if (answerByRound.get(Number(vote.round_index)) === vote.guess_participant_id) {
      totalScores.set(vote.player_id, (totalScores.get(vote.player_id) || 0) + POINTS);
    }
  }

  const orderedScores = [...joined].sort((a, b) =>
    (totalScores.get(b.id) || 0) - (totalScores.get(a.id) || 0)
    || a.joined_at.localeCompare(b.joined_at)
    || a.id.localeCompare(b.id),
  );
  const playerIds = new Map(await Promise.all(joined.map(async (player) => [player.id, await publicId(game.id, player.id)] as const)));
  let rank = 0;
  const scores = orderedScores.map((player, index) => {
    const score = totalScores.get(player.id) || 0;
    const previous = index ? totalScores.get(orderedScores[index - 1].id) || 0 : null;
    if (index === 0 || score !== previous) rank = index + 1;
    return { id: playerIds.get(player.id)!, name: player.name, score, rank };
  });

  const person = people[game.current_round];
  const participants = isHost
    ? await Promise.all(people.map(async (participant) => ({
      id: participant.id,
      name: participant.name,
      description: participant.description,
      photoUrl: await photoUrlFor(participant.photo_path),
    })))
    : people.map((participant) => ({ id: participant.id, name: participant.name })).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const current = person && game.status !== "lobby"
    ? { name: showAnswer ? person.name : null, description: person.description, photoUrl: await photoUrlFor(person.photo_path) }
    : null;
  const ownVote = currentVotes.find((vote) => vote.player_id === playerKey);
  const own = scores.find((row) => row.id === playerIds.get(playerKey));

  return {
    serverTime,
    game: { code: game.code, title: game.title, status: game.status, currentRound: game.current_round, votingEndsAt: game.voting_ends_at, roundKey: roundKey(game) },
    participants,
    players: joined.map((player) => ({ id: playerIds.get(player.id)!, name: player.name })),
    voteCount: currentVotes.length,
    results: ["results", "reveal", "leaderboard", "finished"].includes(game.status) ? grouped : [],
    scores,
    current,
    correctId: showAnswer ? person?.id ?? null : null,
    isHost,
    me: own ? { ...own, voteParticipantId: ownVote?.guess_participant_id ?? null, correct: showAnswer ? ownVote?.guess_participant_id === person?.id : null } : null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomCode = (url.searchParams.get("code") || "").trim().toUpperCase();
    if (!roomCode) return json({ error: "Escribe el código de la sala." }, 400);
    const organizer = await organizerFromRequest(request);
    const state = await stateFor(roomCode, organizer?.id || "", request.headers.get("x-player-key") || "");
    return state ? json(state) : json({ error: "No encontramos esa sala. Revisa el código." }, 404);
  } catch (error) {
    console.error("game state", error);
    return json({ error: "No se pudo conectar. Revisa las variables de Supabase en Vercel." }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const client = supabaseAdmin();

    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await request.formData();
      const action = String(form.get("action") || "");
      if (!["add_participant", "edit_participant"].includes(action)) return json({ error: "Acción no válida." }, 400);
      const roomCode = String(form.get("code") || "").toUpperCase();
      const organizer = await organizerFromRequest(request);
      if (!organizer) return json({ error: "Inicia sesión con la cuenta autorizada del organizador." }, 401);
      const game = await requireOwner(roomCode, organizer.id);
      if (!game) return json({ error: "No tienes acceso de organizador a esta sala." }, 403);
      if (game.status !== "lobby") return json({ error: "Solo puedes editar antes de comenzar." }, 409);

      const name = String(form.get("name") || "").trim();
      const description = String(form.get("description") || "").trim();
      if (!name || !description || name.length > 60 || description.length > 3000) return json({ error: "Agrega un nombre (máximo 60 caracteres) y una descripción (máximo 3000)." }, 400);

      const personId = String(form.get("participantId") || "");
      let existing: PersonRow | null = null;
      if (action === "edit_participant") {
        const result = await client.from("participants").select("id,name,description,photo_path,sort_order").eq("id", personId).eq("game_id", game.id).maybeSingle();
        if (result.error) throw result.error;
        existing = result.data as PersonRow | null;
        if (!existing) return json({ error: "Esta persona ya no está en la sala." }, 404);
      }

      let photoPath = existing?.photo_path ?? null;
      let newPhotoPath: string | null = null;
      const photo = form.get("photo");
      if (photo instanceof File && photo.size) {
        if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(photo.type)) return json({ error: "Usa una foto JPG, PNG, WEBP o GIF." }, 400);
        if (photo.size > 8_000_000) return json({ error: "La foto debe pesar menos de 8 MB." }, 400);
        newPhotoPath = `games/${game.id}/${id()}`;
        const upload = await client.storage.from("photos").upload(newPhotoPath, await photo.arrayBuffer(), {
          contentType: photo.type,
          cacheControl: "31536000",
          upsert: false,
        });
        if (upload.error) throw upload.error;
        photoPath = newPhotoPath;
      }

      if (existing) {
        const result = await client.from("participants").update({ name, description, photo_path: photoPath }).eq("id", existing.id).eq("game_id", game.id).select("id").maybeSingle();
        if (result.error || !result.data) {
          if (newPhotoPath) await deletePhoto(newPhotoPath);
          if (result.error) throw result.error;
          return json({ error: "La ronda ya comenzó. La foto no fue modificada." }, 409);
        }
        if (newPhotoPath && existing.photo_path) await deletePhoto(existing.photo_path);
      } else {
        const latest = await client.from("participants").select("sort_order").eq("game_id", game.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
        if (latest.error) throw latest.error;
        const sortOrder = latest.data ? Number(latest.data.sort_order) + 1 : 0;
        const result = await client.from("participants").insert({ game_id: game.id, name, description, photo_path: photoPath, sort_order: sortOrder }).select("id").single();
        if (result.error) {
          if (newPhotoPath) await deletePhoto(newPhotoPath);
          throw result.error;
        }
      }

      return json((await stateFor(roomCode, organizer.id))!, existing ? 200 : 201);
    }

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "list_games") {
      const organizer = await organizerFromRequest(request);
      if (!organizer) return json({ error: "Inicia sesión con la cuenta autorizada del organizador." }, 401);
      const result = await client
        .from("games")
        .select("code,title,status,created_at")
        .eq("owner_id", organizer.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (result.error) throw result.error;
      return json({
        games: (result.data || []).map((game: { code: string; title: string; status: Phase; created_at: string }) => ({
          code: game.code,
          title: game.title,
          status: game.status,
          createdAt: game.created_at,
        })),
      });
    }

    if (action === "create") {
      const organizer = await organizerFromRequest(request);
      if (!organizer) return json({ error: "Inicia sesión con la cuenta autorizada del organizador." }, 401);
      const title = String(body.title || "Día del Niño").trim().slice(0, 80) || "Día del Niño";
      let roomCode = code();
      while (await getGame(roomCode)) roomCode = code();
      const storedHostKey = await digestSecret(id());
      const gameResult = await client.from("games").insert({ code: roomCode, title, host_key: storedHostKey, owner_id: organizer.id }).select("id").single();
      if (gameResult.error) throw gameResult.error;

      if (body.demo) {
        const demo = [
          ["Sofía", "Convertía cualquier caja en una casa y siempre llevaba colores en la mochila."],
          ["Marco", "No se separaba de su pelota, hacía preguntas sobre todo y quería ser astronauta."],
          ["Elena", "Le encantaba cantar frente a la familia y coleccionaba stickers de animales."],
          ["Diego", "Desarmaba todos sus juguetes para descubrir cómo funcionaban."],
        ];
        const demoResult = await client.from("participants").insert(demo.map(([name, description], sort_order) => ({ game_id: gameResult.data.id, name, description, sort_order })));
        if (demoResult.error) throw demoResult.error;
      }
      return json({ code: roomCode }, 201);
    }

    const roomCode = String(body.code || "").trim().toUpperCase();
    if (action === "join") {
      const game = await getGame(roomCode);
      if (!game) return json({ error: "No encontramos esa sala." }, 404);
      const name = String(body.name || "").trim().slice(0, 40);
      if (!name) return json({ error: "Escribe tu nombre." }, 400);
      const key = String(body.playerKey || "");
      if (key) {
        const existing = await client.from("players").select("id").eq("id", key).eq("game_id", game.id).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) return json({ playerId: key, state: (await stateFor(roomCode, "", key))! });
      }
      const result = await client.from("players").insert({ game_id: game.id, name }).select("id").single();
      if (result.error) throw result.error;
      return json({ playerId: result.data.id, state: (await stateFor(roomCode, "", result.data.id))! }, 201);
    }

    if (action === "vote") {
      const game = await advanceClock(roomCode);
      const playerId = String(body.playerId || "");
      const guessId = String(body.participantId || "");
      const roundIndex = Number(body.roundIndex);
      if (!game || roundIndex !== game.current_round || body.roundKey !== roundKey(game)) return json({ error: "La ronda cambió. Espera a que se actualice la pantalla." }, 409);
      if (game.status !== "voting" || !game.voting_ends_at || Date.now() >= game.voting_ends_at) return json({ error: "La votación ya está cerrada." }, 409);

      const [player, participant, previous] = await Promise.all([
        client.from("players").select("id").eq("id", playerId).eq("game_id", game.id).maybeSingle(),
        client.from("participants").select("id").eq("id", guessId).eq("game_id", game.id).maybeSingle(),
        client.from("votes").select("guess_participant_id").eq("game_id", game.id).eq("round_index", game.current_round).eq("player_id", playerId).maybeSingle(),
      ]);
      if (player.error) throw player.error;
      if (participant.error) throw participant.error;
      if (previous.error) throw previous.error;
      if (!player.data || !participant.data) return json({ error: "Tu sesión de jugador ya no es válida." }, 403);
      if (previous.data && previous.data.guess_participant_id !== guessId) return json({ error: "Ya confirmaste una respuesta en esta ronda." }, 409);

      if (!previous.data) {
        const inserted = await client.from("votes").insert({ game_id: game.id, round_index: game.current_round, player_id: playerId, guess_participant_id: guessId });
        if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
      }
      return json((await stateFor(roomCode, "", playerId))!);
    }

    const organizer = await organizerFromRequest(request);
    if (!organizer) return json({ error: "Inicia sesión con la cuenta autorizada del organizador." }, 401);
    const game = await requireOwner(roomCode, organizer.id);
    if (!game) return json({ error: "No tienes acceso de organizador a esta sala." }, 403);

    if (action === "delete_participant") {
      if (game.status !== "lobby") return json({ error: "La actividad ya comenzó." }, 409);
      const participantId = String(body.participantId || "");
      const row = await client.from("participants").select("photo_path").eq("id", participantId).eq("game_id", game.id).maybeSingle();
      if (row.error) throw row.error;
      const removed = await client.from("participants").delete().eq("id", participantId).eq("game_id", game.id);
      if (removed.error) throw removed.error;
      if (row.data?.photo_path) await deletePhoto(row.data.photo_path);
      await normalizeParticipantOrder(game.id);
      return json((await stateFor(roomCode, organizer.id))!);
    }

    if (action === "control") {
      const command = String(body.command || "");
      if (body.roundKey !== roundKey(game) || body.expectedPhase !== game.status) return json({ error: "La pantalla cambió. Usa el control de la ronda actual." }, 409);
      const total = await client.from("participants").select("id", { count: "exact", head: true }).eq("game_id", game.id);
      if (total.error) throw total.error;
      const count = total.count || 0;

      if (command === "start" && game.status === "lobby") {
        if (count < 2) return json({ error: "Agrega al menos dos personas." }, 400);
        await normalizeParticipantOrder(game.id);
        const result = await client.from("games").update({ status: "countdown", current_round: 0, voting_ends_at: roundEnd() }).eq("id", game.id).eq("status", "lobby");
        if (result.error) throw result.error;
      } else if (command === "reset" && game.status !== "lobby") {
        const votes = await client.from("votes").delete().eq("game_id", game.id);
        if (votes.error) throw votes.error;
        const result = await client.from("games").update({ status: "lobby", current_round: 0, voting_ends_at: null }).eq("id", game.id).eq("status", game.status);
        if (result.error) throw result.error;
      } else {
        const transitions: Record<string, { from: Phase[]; to: Phase }> = {
          close: { from: ["voting"], to: "results" },
          reveal: { from: ["results"], to: "reveal" },
          leaderboard: { from: ["reveal"], to: "leaderboard" },
          next: { from: ["reveal", "leaderboard"], to: game.current_round + 1 >= count ? "finished" : "countdown" },
        };
        const transition = transitions[command];
        if (!transition?.from.includes(game.status)) return json({ error: "Ese control no está disponible en esta fase." }, 409);
        const nextRound = command === "next" && transition.to !== "finished" ? game.current_round + 1 : game.current_round;
        const end = transition.to === "countdown" ? roundEnd() : game.voting_ends_at;
        const result = await client.from("games").update({ status: transition.to, current_round: nextRound, voting_ends_at: end }).eq("id", game.id).eq("status", game.status).eq("current_round", game.current_round);
        if (result.error) throw result.error;
      }
      return json((await stateFor(roomCode, organizer.id))!);
    }

    return json({ error: "Acción no válida." }, 400);
  } catch (error) {
    console.error("game action", error);
    return json({ error: "No pudimos guardar los cambios. Revisa Supabase y las variables de Vercel." }, 503);
  }
}
