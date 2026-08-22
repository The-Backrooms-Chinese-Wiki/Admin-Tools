import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface PageInfo {
  pageid: number;
  ns: number;
  title: string;
}

interface FailedPageInfo {
  pageid: number;
  title: string;             // Status 页面标题，例如 Status:Example
  mainTitle: string;        // 主文章标题，例如 Example
  statusTimestamp: string;  // 审核时间（Status 页面最后修改时间）
  mainTimestamp: string | null; // 主文章最后编辑时间，可能为 null
}

interface AuditResult {
  unreviewed: PageInfo[];
  failed: FailedPageInfo[];
  orphanedStatus: PageInfo[];
}

const API_BASE = 'https://mirror.backroomszh.org/w/api.php';
const STATUS_NS = 5508;
const MAIN_NS = 0;

// 1. 获取指定命名空间的所有非重定向页面
async function fetchAllNonRedirectPages(namespace: number): Promise<PageInfo[]> {
  let pages: PageInfo[] = [];
  let apcontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      list: 'allpages',
      apnamespace: String(namespace),
      aplimit: 'max',
      apfilterredir: 'nonredirects',
      format: 'json',
      maxage: '0',
      smaxage: '0',
    });
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

// 2. 从页面列表中排除重定向（用于 Status 命名空间）
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

// 3. 获取未过审页面（含主文章最后编辑时间）
async function fetchFailedPages(): Promise<FailedPageInfo[]> {
  // 第一步：获取所有属于 Category:未过审页面 的 Status 页面及其最后修改时间
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

  // 第二步：提取主文章标题列表，批量查询主文章的最后编辑时间
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
        const title = page.title;
        const timestamp = page.revisions?.[0]?.timestamp ?? null;
        mainTimestamps.set(title, timestamp);
      }
    }
  }

  // 第三步：组装最终数据
  const failed: FailedPageInfo[] = rawFailed.map(item => {
    const mainTitle = item.title.replace(/^Status:/, '');
    return {
      pageid: item.pageid,
      title: item.title,
      mainTitle,
      statusTimestamp: item.timestamp,
      mainTimestamp: mainTimestamps.get(mainTitle) ?? null,
    };
  });

  return failed;
}

// 主 API 处理函数
export async function GET() {
  try {
    const mainPages = await fetchAllNonRedirectPages(MAIN_NS);

    // 获取 Status 命名空间页面（过滤重定向）
    let statusPagesAll: PageInfo[] = [];
    let apcontinue: string | null = null;
    do {
      const params = new URLSearchParams({
        action: 'query',
        list: 'allpages',
        apnamespace: String(STATUS_NS),
        aplimit: 'max',
        format: 'json',
        maxage: '0',
        smaxage: '0',
      });
      if (apcontinue) params.append('apcontinue', apcontinue);

      const res = await fetch(`${API_BASE}?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Status 命名空间 API 请求失败: ${res.status}`);
      const data = await res.json();
      if (data.query?.allpages) {
        statusPagesAll = statusPagesAll.concat(data.query.allpages);
      }
      apcontinue = data.continue?.apcontinue ?? null;
    } while (apcontinue);

    const statusPages = await filterOutRedirects(statusPagesAll);
    const failedPages = await fetchFailedPages();

    const mainTitles = new Set(mainPages.map(p => p.title));
    const statusTitleToMain = new Map<string, string>();
    for (const sp of statusPages) {
      if (sp.title.startsWith('Status:')) {
        statusTitleToMain.set(sp.title, sp.title.slice(7));
      }
    }

    const reviewedMainTitles = new Set(statusTitleToMain.values());
    const unreviewed = mainPages.filter(p => !reviewedMainTitles.has(p.title));

    const orphanedStatus = statusPages.filter(sp => {
      const mainTitle = statusTitleToMain.get(sp.title);
      return mainTitle && !mainTitles.has(mainTitle);
    });

    return NextResponse.json(
      {
        unreviewed,
        failed: failedPages,
        orphanedStatus,
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
