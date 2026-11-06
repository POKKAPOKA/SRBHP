import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
export const MAX_PROOF_BYTES = 4 * 1024 * 1024;

export async function readProof(file: FormDataEntryValue | null, required: boolean) {
  if (!(file instanceof File) || !file.size) {
    if (required) throw new Error("証跡画像を選択してください。");
    return null;
  }
  if (file.size > MAX_PROOF_BYTES) throw new Error("画像は4MB以下にしてください。");
  const bytes = Buffer.from(await file.arrayBuffer());
  let mime: "image/jpeg" | "image/png" | "image/webp";
  let extension: "jpg" | "png" | "webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { mime = "image/jpeg"; extension = "jpg"; }
  else if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) { mime = "image/png"; extension = "png"; }
  else if (bytes.length > 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") { mime = "image/webp"; extension = "webp"; }
  else throw new Error("JPEG・PNG・WebP形式の画像を選択してください。");
  if (file.type && file.type !== mime) throw new Error("画像の形式を確認してください。");
  return { bytes, mime, extension };
}

export async function uploadProof(supabase: Client, userId: string, eventId: string, image: NonNullable<Awaited<ReturnType<typeof readProof>>>) {
  const path = `${userId}/${eventId}/${randomUUID()}.${image.extension}`;
  const { error } = await supabase.storage.from("proofs").upload(path, image.bytes, { contentType: image.mime, upsert: false });
  if (error) throw new Error("画像を保存できませんでした。もう一度お試しください。");
  const { data } = supabase.storage.from("proofs").getPublicUrl(path);
  return data.publicUrl;
}
