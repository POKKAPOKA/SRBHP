import type { BingoSubmission, EventAttendance, Member } from "@/types/database";

export type BingoConfig = { size: 3 | 5; missions: string[] };
export function parseBingoConfig(value: unknown): BingoConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const config = value as Record<string, unknown>;
  if ((config.size !== 3 && config.size !== 5) || !Array.isArray(config.missions) || config.missions.length !== config.size ** 2 || config.missions.some((v) => typeof v !== "string" || !v.trim())) return null;
  return { size: config.size, missions: config.missions as string[] };
}
export function bingoStats(size: 3 | 5, indices: Iterable<number>) {
  const cells = new Set([...indices].filter((i) => Number.isInteger(i) && i >= 0 && i < size * size));
  const lines: number[][] = [];
  for (let i = 0; i < size; i++) {
    lines.push(Array.from({ length: size }, (_, j) => i * size + j));
    lines.push(Array.from({ length: size }, (_, j) => j * size + i));
  }
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + size - 1 - i));
  const counts = lines.map((line) => line.filter((i) => cells.has(i)).length);
  return { achieved: cells.size, reach: counts.filter((count) => count === size - 1).length, lines: counts.filter((count) => count === size).length };
}
export type BingoStanding = { memberId: string; name: string; achieved: number; reach: number; lines: number; rank: number };
export type BingoRankingData = { kind: "bingo"; version: 1; size: 3 | 5; standings: BingoStanding[] };
export function parseBingoRanking(value: unknown): BingoRankingData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.kind !== "bingo" || data.version !== 1 || (data.size !== 3 && data.size !== 5) || !Array.isArray(data.standings)) return null;
  const valid = data.standings.every((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return typeof row.memberId === "string" && typeof row.name === "string" && [row.achieved, row.reach, row.lines, row.rank].every((n) => Number.isSafeInteger(n) && Number(n) >= 0);
  });
  return valid ? value as BingoRankingData : null;
}
export function bingoStandings(size: 3 | 5, submissions: BingoSubmission[], members: Pick<Member, "id" | "display_name" | "status">[], attendance: Pick<EventAttendance, "member_id" | "status">[]): BingoStanding[] {
  const participants = new Set([...attendance.filter((a) => a.status !== "absent").map((a) => a.member_id), ...submissions.map((s) => s.member_id)]);
  const rows = members.filter((member) => member.status === "active" && participants.has(member.id)).map((member) => ({ memberId: member.id, name: member.display_name, ...bingoStats(size, submissions.filter((s) => s.member_id === member.id).map((s) => s.cell_index)), rank: 0 }));
  rows.sort((a, b) => b.lines - a.lines || b.achieved - a.achieved || a.name.localeCompare(b.name, "ja") || a.memberId.localeCompare(b.memberId));
  for (let i = 0; i < rows.length; i++) rows[i].rank = i > 0 && rows[i - 1].lines === rows[i].lines && rows[i - 1].achieved === rows[i].achieved ? rows[i - 1].rank : i + 1;
  return rows;
}
