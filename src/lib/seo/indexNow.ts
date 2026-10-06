// Place at: src/lib/seo/indexNow.ts
//
// IndexNow: tells Bing (and the engines that share its index - DuckDuckGo,
// Ecosia, ChatGPT search, Copilot - plus Yandex, Seznam and Naver) the
// moment a page is added or changes, instead of waiting for a crawl.
//
// Only pages whose sitemap lastModified date moved since the last
// submission are sent - IndexNow asks for changed URLs, not the whole site
// every time. What was last sent is kept in one small document.
//
// The key isn't a secret: IndexNow proves ownership by serving it at
// /<key>.txt (public/), so it lives in the code.
import { getContainer } from "@/lib/cosmos";

export const INDEXNOW_KEY = "690b88592f8ecb437733869e5bb75dd2";
export const INDEXNOW_HOST = "roadverdict.co.uk";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const DOC_ID = "indexNowSubmitted";
const PK = "system";

type SubmittedDoc = { id: string; pk: string; type: "indexNowSubmitted"; urls: Record<string, string>; lastSubmittedAt: string };

export type SitemapPage = { url: string; lastModified: string };

// The pages that are new, or whose lastModified differs from what was sent.
export function changedPages(pages: SitemapPage[], sent: Record<string, string>): SitemapPage[] {
  return pages.filter((p) => sent[p.url] !== p.lastModified);
}

export async function readSubmitted(): Promise<Record<string, string>> {
  try {
    const { resource } = await getContainer().item(DOC_ID, PK).read<SubmittedDoc>();
    return resource?.urls ?? {};
  } catch {
    return {};
  }
}

async function saveSubmitted(urls: Record<string, string>): Promise<void> {
  const doc: SubmittedDoc = { id: DOC_ID, pk: PK, type: "indexNowSubmitted", urls, lastSubmittedAt: new Date().toISOString() };
  await getContainer().items.upsert(doc);
}

export type IndexNowResult = { submitted: string[]; status: number | null; unchanged: number };

// Sends the changed pages, and records them as sent only when IndexNow
// accepted them (200 or 202), so a failure is retried on the next run.
export async function submitChangedPages(pages: SitemapPage[], fetchImpl: typeof fetch = fetch): Promise<IndexNowResult> {
  const sent = await readSubmitted();
  const changed = changedPages(pages, sent);
  if (changed.length === 0) return { submitted: [], status: null, unchanged: pages.length };

  const res = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
      urlList: changed.map((p) => p.url),
    }),
  });
  if (res.status === 200 || res.status === 202) {
    const next = { ...sent };
    for (const p of changed) next[p.url] = p.lastModified;
    await saveSubmitted(next);
  }
  return { submitted: changed.map((p) => p.url), status: res.status, unchanged: pages.length - changed.length };
}
