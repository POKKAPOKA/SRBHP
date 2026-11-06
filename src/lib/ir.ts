import type { IrSubmission, Member } from "@/types/database";

export type IrSong = { game_title: string; song_title: string; difficulty: string };
export type IrRankedEntry = { memberId: string; name: string; score: number; rank: number; commentary: string; judge: Record<string, number> };
export type IrOverallEntry = { memberId: string; name: string; rank: number; points: number; songsCompleted: number };
export type IrRankingData = { kind: "ir"; version: 1; asOf?: string; songs: Array<IrSong & { entries: IrRankedEntry[] }>; overall: IrOverallEntry[] };
export type IrLog = IrSubmission & { member_name: string };

const normalize = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja-JP");
export const songKey = (song: IrSong) => [song.game_title, song.song_title, song.difficulty].map(normalize).join("\u0000");
export function parseIrSongs(value: unknown): IrSong[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const songs = (value as Record<string, unknown>).songs;
  if (!Array.isArray(songs) || songs.length < 1 || songs.length > 30) return null;
  const result: IrSong[] = [];
  for (const song of songs) {
    if (!song || typeof song !== "object" || Array.isArray(song)) return null;
    const row = song as Record<string, unknown>;
    if ([row.game_title, row.song_title, row.difficulty].some((v) => typeof v !== "string" || !v.trim())) return null;
    result.push({ game_title: row.game_title as string, song_title: row.song_title as string, difficulty: row.difficulty as string });
  }
  return new Set(result.map(songKey)).size === result.length ? result : null;
}

export function buildIrRanking(songs: IrSong[], submissions: IrSubmission[], members: Pick<Member, "id" | "display_name">[]): IrRankingData {
  const names = new Map(members.map((member) => [member.id, member.display_name]));
  const validKeys = new Set(songs.map(songKey));
  const best = new Map<string, IrSubmission>();
  for (const row of submissions) {
    const key = songKey(row);
    if (!validKeys.has(key) || !names.has(row.member_id) || !Number.isSafeInteger(row.score) || row.score < 0) continue;
    const pair = `${row.member_id}\u0001${key}`;
    const old = best.get(pair);
    if (!old || row.score > old.score || (row.score === old.score && (Date.parse(row.submitted_at) < Date.parse(old.submitted_at) || (Date.parse(row.submitted_at) === Date.parse(old.submitted_at) && row.id < old.id)))) best.set(pair, row);
  }
  const entries = [...best.values()];
  const participantCount = new Set(entries.map((entry) => entry.member_id)).size;
  const overall = new Map<string, IrOverallEntry>();
  const rankedSongs = songs.map((song) => {
    const ranked = entries.filter((entry) => songKey(entry) === songKey(song)).sort((a, b) => b.score - a.score || Date.parse(a.submitted_at) - Date.parse(b.submitted_at) || a.id.localeCompare(b.id));
    const result: IrRankedEntry[] = [];
    for (const [i, entry] of ranked.entries()) {
      const rank = i && ranked[i - 1].score === entry.score ? result[i - 1].rank : i + 1;
      const name = names.get(entry.member_id)!;
      const rawJudge = entry.judge_breakdown && typeof entry.judge_breakdown === "object" && !Array.isArray(entry.judge_breakdown) ? entry.judge_breakdown : {};
      const judge = Object.fromEntries(Object.entries(rawJudge).filter(([key, value]) => key.length > 0 && key.length <= 60 && Number.isSafeInteger(value) && value >= 0).slice(0, 30));
      result.push({ memberId: entry.member_id, name, score: entry.score, rank, commentary: typeof entry.ai_commentary === "string" ? entry.ai_commentary.slice(0, 500) : "", judge });
      const standing = overall.get(entry.member_id) ?? { memberId: entry.member_id, name, rank: 0, points: 0, songsCompleted: 0 };
      standing.points += participantCount - rank + 1; standing.songsCompleted++; overall.set(entry.member_id, standing);
    }
    return { ...song, entries: result };
  });
  const rankedOverall = [...overall.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "ja") || a.memberId.localeCompare(b.memberId));
  for (let i = 0; i < rankedOverall.length; i++) rankedOverall[i].rank = i > 0 && rankedOverall[i - 1].points === rankedOverall[i].points ? rankedOverall[i - 1].rank : i + 1;
  return { kind: "ir", version: 1, songs: rankedSongs, overall: rankedOverall };
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function parseIrRanking(value: unknown): IrRankingData | null {
  if (!record(value) || value.kind !== "ir" || value.version !== 1 || (value.asOf !== undefined && (typeof value.asOf !== "string" || !Number.isFinite(Date.parse(value.asOf)))) || !Array.isArray(value.songs) || !Array.isArray(value.overall)) return null;
  const validOverall = value.overall.every((v: unknown) => record(v) && typeof v.memberId === "string" && typeof v.name === "string" && Number.isSafeInteger(v.rank) && Number.isSafeInteger(v.points) && Number.isSafeInteger(v.songsCompleted));
  const validSongs = value.songs.every((s: unknown) => record(s) && typeof s.game_title === "string" && typeof s.song_title === "string" && typeof s.difficulty === "string" && Array.isArray(s.entries) && s.entries.every((e: unknown) => record(e) && typeof e.memberId === "string" && typeof e.name === "string" && typeof e.commentary === "string" && Number.isSafeInteger(e.score) && Number.isSafeInteger(e.rank) && record(e.judge) && Object.values(e.judge).every((n) => Number.isSafeInteger(n) && Number(n) >= 0)));
  return validOverall && validSongs ? value as IrRankingData : null;
}
