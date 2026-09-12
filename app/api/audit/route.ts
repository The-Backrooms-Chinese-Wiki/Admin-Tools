import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface PageInfo {
  pageid: number;
  ns: number;
  title: string;
}

interface FailedPageInfo {
  pageid: number;
  title: string;
  mainTitle: string;
  statusTimestamp: string;
  mainTimestamp: string | null;
}

interface PendingPageInfo {
  pageid: number;
  title: string;
  mainTitle: string;
  statusTimestamp: string;
  note: string;
}

interface AuditResult {
  unreviewed: PageInfo[];
  unreviewedRedirects: PageInfo[];  // 新增
  failed: FailedPageInfo[];
  orphanedStatus: PageInfo[];
  pending: PendingPageInfo[];
}

const API_BASE = 'https://mirror.backroomszh.org/w/api.php';
const STATUS_NS = 5508;
const MAIN_NS = 0;

// 通用：按过滤器获取命名空间内所有页面
async function fetchPagesByFilter(
  namespace: number,
  filter: 'redirects' | 'nonredirects' | 'all'
): Promise<PageInfo[]> {
  let pages: PageInfo[] = [];
  let apcontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      list: 'allpages',
      apnamespace: String(namespace),
      aplimit: 'max',
      format: 'json',
      maxage: '0',
      smaxage: '0',
    });
    if (filter !== 'all') {
      params.append('apfilterredir', filter);
    }
    if (apcontinue) params.append('apcontinue', apcontinue);

    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`API 请求失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.allpages) {
      pages = pages.concat(data.query.allpages);
    }
    apcontinue = data.continue?.apcontinue ?? null;
  } while (apcontinue);

  return pages;
}

// 1. 获取指定命名空间的所有非重定向页面
function fetchAllNonRedirectPages(namespace: number): Promise<PageInfo[]> {
  return fetchPagesByFilter(namespace, 'nonredirects');
}

// 2. 获取指定命名空间的所有重定向页面
function fetchAllRedirectPages(namespace: number): Promise<PageInfo[]> {
  return fetchPagesByFilter(namespace, 'redirects');
}

// 3. 从页面列表中排除重定向（用于 Status 命名空间）
async function filterOutRedirects(pages: PageInfo[]): Promise<PageInfo[]> {
  if (pages.length === 0) return [];

  const nonRedirects: PageInfo[] = [];

  for (let i = 0; i < pages.length; i += 50) {
    const batch = pages.slice(i, i + 50);
    const titles = batch.map(p => p.title).join('|');

    const params = new URLSearchParams({
      action: 'query',
      titles: titles,
      prop: 'info',
      format: 'json',
      maxage: '0',
      smaxage: '0',
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`重定向检查失败: ${res.status}`);

    const data = await res.json();
    if (data.query?.pages) {
      for (const [, page] of Object.entries(data.query.pages) as any) {
        if (page.redirect === undefined) {
          nonRedirects.push({
            pageid: page.pageid,
            ns: page.ns,
            title: page.title,
          });
        }
      }
    }
  }

  return nonRedirects;
}

// 4. 获取未过审页面（含主文章最后编辑时间）
async function fetchFailedPages(): Promise<FailedPageInfo[]> {
  const rawFailed: { pageid: number; title: string; timestamp: string }[] = [];
  let gcmcontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: 'Category:未过审页面',
      gcmtype: 'page',
      prop: 'info|revisions',
      rvprop: 'timestamp',
      format: 'json',
      maxage: '0',
      smaxage: '0',
    });
    if (gcmcontinue) params.append('gcmcontinue', gcmcontinue);

    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`分类 API 请求失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.pages) {
      for (const [, page] of Object.entries(data.query.pages) as any) {
        if (page.redirect === undefined && page.title.startsWith('Status:')) {
          rawFailed.push({
            pageid: page.pageid,
            title: page.title,
            timestamp: page.revisions?.[0]?.timestamp ?? '',
          });
        }
      }
    }
    gcmcontinue = data.continue?.gcmcontinue ?? null;
  } while (gcmcontinue);

  if (rawFailed.length === 0) return [];

  const mainTitles = rawFailed.map(item => item.title.replace(/^Status:/, ''));
  const mainTimestamps = new Map<string, string | null>();

  for (let i = 0; i < mainTitles.length; i += 50) {
    const batch = mainTitles.slice(i, i + 50).join('|');
    const params = new URLSearchParams({
      action: 'query',
      titles: batch,
      prop: 'revisions',
      rvprop: 'timestamp',
      format: 'json',
      maxage: '0',
      smaxage: '0',
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`主文章时间查询失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.pages) {
      for (const [, page] of Object.entries(data.query.pages) as any) {
        mainTimestamps.set(page.title, page.revisions?.[0]?.timestamp ?? null);
      }
    }
  }

  return rawFailed.map(item => {
    const mainTitle = item.title.replace(/^Status:/, '');
    return {
      pageid: item.pageid,
      title: item.title,
      mainTitle,
      statusTimestamp: item.timestamp,
      mainTimestamp: mainTimestamps.get(mainTitle) ?? null,
    };
  });
}

// 5. 提取 Pending 模板的 note 参数
function extractPendingNote(wikitext: string): string {
  const templateRegex = /\{\{\s*Pending\s*([^}]*)\}\}/i;
  const match = wikitext.match(templateRegex);
  if (!match) return '';
  const params = match[1];
  const noteRegex = /(?:^|\|)\s*note\s*=\s*([^|}]*)/i;
  const noteMatch = params.match(noteRegex);
  return noteMatch ? noteMatch[1].trim() : '';
}

// 6. 获取需要进一步审核的页面
async function fetchPendingPages(): Promise<PendingPageInfo[]> {
  const titles: { pageid: number; title: string }[] = [];
  let geicontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'embeddedin',
      geititle: 'Template:Pending',
      geinamespace: String(STATUS_NS),
      prop: 'info',
      format: 'json',
      maxage: '0',
      smaxage: '0',
    });
    if (geicontinue) params.append('geicontinue', geicontinue);

    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Pending 页面查询失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.pages) {
      for (const [, page] of Object.entries(data.query.pages) as any) {
        if (page.redirect === undefined && page.title.startsWith('Status:')) {
          titles.push({ pageid: page.pageid, title: page.title });
        }
      }
    }
    geicontinue = data.continue?.geicontinue ?? null;
  } while (geicontinue);

  if (titles.length === 0) return [];

  const pending: PendingPageInfo[] = [];

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const titlesParam = batch.map(t => t.title).join('|');
    const params = new URLSearchParams({
      action: 'query',
      titles: titlesParam,
      prop: 'revisions',
      rvprop: 'content|timestamp',
      format: 'json',
      maxage: '0',
      smaxage: '0',
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Pending 内容获取失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.pages) {
      for (const [, page] of Object.entries(data.query.pages) as any) {
        const title = page.title;
        const pageid = page.pageid;
        const timestamp = page.revisions?.[0]?.timestamp ?? '';
        const content = page.revisions?.[0]?.content ?? '';
        pending.push({
          pageid,
          title,
          mainTitle: title.slice(7),
          statusTimestamp: timestamp,
          note: extractPendingNote(content),
        });
      }
    }
  }

  return pending;
}

// 主处理函数
export async function GET() {
  try {
    // 并行获取主命名空间的非重定向页面、重定向页面，以及所有 Status 页面
    const [mainPages, mainRedirects, statusPagesAll] = await Promise.all([
      fetchAllNonRedirectPages(MAIN_NS),
      fetchAllRedirectPages(MAIN_NS),
      fetchPagesByFilter(STATUS_NS, 'all'),
    ]);

    const statusPages = await filterOutRedirects(statusPagesAll);

    const [failedPages, pendingPages] = await Promise.all([
      fetchFailedPages(),
      fetchPendingPages(),
    ]);

    const mainTitles = new Set(mainPages.map(p => p.title));
    const statusTitleToMain = new Map<string, string>();
    for (const sp of statusPages) {
      if (sp.title.startsWith('Status:')) {
        statusTitleToMain.set(sp.title, sp.title.slice(7));
      }
    }

    // 已存在 Status 页面对应的主标题集合（重定向和非重定向共用）
    const reviewedMainTitles = new Set(statusTitleToMain.values());

    // 未审核：非重定向主页面中没有对应 Status
    const unreviewed = mainPages.filter(p => !reviewedMainTitles.has(p.title));

    // 新增：未审核重定向页面：主命名空间中的重定向页没有对应 Status
    const unreviewedRedirects = mainRedirects.filter(
      p => !reviewedMainTitles.has(p.title)
    );

    // 孤立 Status
    const orphanedStatus = statusPages.filter(sp => {
      const mainTitle = statusTitleToMain.get(sp.title);
      return mainTitle && !mainTitles.has(mainTitle);
    });

    return NextResponse.json(
      {
        unreviewed,
        unreviewedRedirects,
        failed: failedPages,
        orphanedStatus,
        pending: pendingPages,
      } satisfies AuditResult,
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || '未知错误' }, { status: 500 });
  }
}
