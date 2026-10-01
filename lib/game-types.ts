export const ROUND_SECONDS = 60;
export const INTRO_SECONDS = 4;
export const POINTS = 1000;

export type Phase = "lobby" | "countdown" | "voting" | "results" | "reveal" | "leaderboard" | "finished";
export type Person = { id: string; name: string; description?: string; photoUrl?: string | null };
export type Score = { id: string; name: string; score: number; rank: number };
export type GameState = {
  serverTime: number;
  game: { code: string; title: string; status: Phase; currentRound: number; votingEndsAt: number | null; roundKey: string; };
  participants: Person[];
  players: { id: string; name: string }[];
  voteCount: number;
  results: { participantId: string; count: number }[];
  scores: Score[];
  current: { name: string | null; description: string; photoUrl: string | null } | null;
  correctId: string | null;
  isHost: boolean;
  me: { id: string; name: string; score: number; rank: number; voteParticipantId: string | null; correct: boolean | null } | null;
};

export function participantLabel(person: Person) { return person.name; }
export function participantValue(person: Person) { return person.id; }
export function sameParticipant(a: Person, b: Person) { return a.id === b.id; }
export function matchesParticipant(person: Person, query: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
  return normalize(person.name).includes(normalize(query));
}
