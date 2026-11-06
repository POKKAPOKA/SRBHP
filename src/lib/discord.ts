import "server-only";
import { formatEventDate } from "@/lib/events";
import type { Event } from "@/types/database";

export type DiscordResult = { status: "sent" | "skipped" | "error"; sent: number };

async function postToDiscord(body: object): Promise<"sent" | "skipped" | "error"> {
  const configured = process.env.DISCORD_WEBHOOK_URL;
  if (!configured) { console.warn("Discord webhook is not configured; notification skipped."); return "skipped"; }
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || !["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"].includes(url.hostname) || !/^\/api\/webhooks\/\d+\//.test(url.pathname) || url.username || url.password) {
      console.warn("Discord webhook URL is invalid; notification skipped."); return "error";
    }
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) { console.warn(`Discord webhook failed with status ${response.status}.`); return "error"; }
    return "sent";
  } catch { console.warn("Discord webhook request failed."); return "error"; }
}

export async function sendEventApproval(event: Pick<Event, "title" | "description" | "start_at" | "end_at" | "location">): Promise<DiscordResult> {
  const status = await postToDiscord({ allowed_mentions: { parse: [] }, embeds: [{ title: "イベントが承認されました", description: event.title.slice(0, 256), color: 0x7c3aed, fields: [{ name: "日時（日本時間）", value: `${formatEventDate(event.start_at)} 〜 ${formatEventDate(event.end_at)}` }, { name: "場所", value: (event.location || "未設定").slice(0, 1024) }, { name: "概要", value: (event.description || "詳細は部員ポータルをご確認ください。").slice(0, 1024) }] }] });
  return { status, sent: status === "sent" ? 1 : 0 };
}

export async function sendAttendanceReminder(discordIds: string[], label: string): Promise<DiscordResult> {
  const ids = [...new Set(discordIds.filter((id) => /^\d{15,22}$/.test(id)))];
  if (!ids.length) return { status: "skipped", sent: 0 };
  let sent = 0;
  // Stay well below Discord's message and allowed_mentions limits.
  for (let i = 0; i < ids.length; i += 50) {
    const group = ids.slice(i, i + 50);
    const content = `${label.slice(0, 200)}\n部員ポータルで出欠をご確認ください。\n${group.map((id) => `<@${id}>`).join(" ")}`;
    const status = await postToDiscord({ content, allowed_mentions: { parse: [], users: group } });
    if (status !== "sent") return { status, sent };
    sent += group.length;
  }
  return { status: "sent", sent };
}

export async function sendSnapshotAnnouncement(event: Pick<Event, "id" | "title">, final: boolean): Promise<DiscordResult> {
  let link: string | null = null;
  try {
    const configured = process.env.NEXT_PUBLIC_SITE_URL;
    if (configured) {
      const base = new URL(configured);
      if (["https:", "http:"].includes(base.protocol) && !base.username && !base.password) link = new URL(final ? `/results/${event.id}` : `/portal/events/${event.id}`, base).toString();
    }
  } catch { /* Invalid site URLs are treated as unconfigured. */ }
  if (final && !link) { console.warn("Site URL is not configured; final result notification skipped."); return { status: "skipped", sent: 0 }; }
  const status = await postToDiscord({ allowed_mentions: { parse: [] }, embeds: [{ title: final ? "最終結果を公開しました" : "中間発表を公開しました", description: event.title.slice(0, 256), color: final ? 0xf59e0b : 0x7c3aed, ...(link ? { url: link } : {}) }] });
  return { status, sent: status === "sent" ? 1 : 0 };
}
