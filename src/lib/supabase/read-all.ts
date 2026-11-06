import "server-only";

// PostgREST caps a single response; fetch deterministic pages to avoid
// silently omitting members or attendance records from aggregates.
export async function readAllPages<T>(getPage: (start: number, end: number) => PromiseLike<{ data: unknown; error: unknown; count: number | null }>): Promise<T[]> {
  const result: T[] = [];
  const size = 500;
  let start = 0;
  for (;;) {
    const { data, error, count } = await getPage(start, start + size - 1);
    if (error || !Array.isArray(data) || count === null) throw new Error("データを取得できませんでした。");
    result.push(...data as T[]);
    if (result.length >= count) return result;
    if (!data.length) throw new Error("データをすべて取得できませんでした。");
    // A project may impose a lower max-rows limit than the requested page size.
    start += data.length;
  }
}
