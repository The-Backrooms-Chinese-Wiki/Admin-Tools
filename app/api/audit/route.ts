import { NextResponse } from 'next/server';

// 强制每次请求都实时执行，避免 Next.js 静态优化
export const dynamic = 'force-dynamic';

interface PageInfo {
  pageid: number;
  ns: number;
  title: string;
}

interface FailedPageInfo {
  pageid: number;
  title: string;
  timestamp: string; // ISO 8601
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
      apfilterredir: 'nonredirects', // 只获取非重定向
      format: 'json',
      maxage: '0',   // 告诉 MediaWiki 不使用缓存
      smaxage: '0',
    });
    if (apcontinue) params.append('apcontinue', apcontinue);

    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      cache: 'no-store',   // 禁用 Next.js 数据缓存
    });
    if (!res.ok) throw new Error(`API请求失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.allpages) {
      pages = pages.concat(data.query.allpages);
    }
    apcontinue = data.continue?.apcontinue ?? null;
  } while (apcontinue);

  return pages;
}

// 2. 从已获取的页面列表中排除重定向（用于 Status 命名空间）
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

// 3. 获取未过审页面（Status 页面且属于 Category:未过审页面）
async function fetchFailedPages(): Promise<FailedPageInfo[]> {
  let failed: FailedPageInfo[] = [];
  let gcmcontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: 'Category:未过审页面',
      gcmtype: 'page',            // 只取页面，不含子分类和文件
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
    if (!res.ok) throw new Error(`分类API请求失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.pages) {
      for (const [, page] of Object.entries(data.query.pages) as any) {
        // 排除重定向
        if (page.redirect === undefined) {
          failed.push({
            pageid: page.pageid,
            title: page.title,
            timestamp: page.revisions?.[0]?.timestamp ?? '',
          });
        }
      }
    }
    gcmcontinue = data.continue?.gcmcontinue ?? null;
  } while (gcmcontinue);

  return failed;
}

// 主 API 处理函数
export async function GET() {
  try {
    // 并行请求：主命名空间非重定向页面 + Status 命名空间所有页面（稍后过滤重定向）
    const mainPages = await fetchAllNonRedirectPages(MAIN_NS);

    // 获取 Status 命名空间的所有页面（先不过滤重定向，后续处理）
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
      if (!res.ok) throw new Error(`Status命名空间API请求失败: ${res.status}`);
      const data = await res.json();

      if (data.query?.allpages) {
        statusPagesAll = statusPagesAll.concat(data.query.allpages);
      }
      apcontinue = data.continue?.apcontinue ?? null;
    } while (apcontinue);

    // 过滤掉 Status 命名空间中的重定向页面
    const statusPages = await filterOutRedirects(statusPagesAll);

    // 获取未过审页面（已过滤重定向）
    const failedPages = await fetchFailedPages();

    // 构建映射关系
    const mainTitles = new Set(mainPages.map(p => p.title));
    const statusTitleToMain = new Map<string, string>();
    for (const sp of statusPages) {
      if (sp.title.startsWith('Status:')) {
        const mainTitle = sp.title.slice(7); // 去除前缀 'Status:'
        statusTitleToMain.set(sp.title, mainTitle);
      }
    }

    // 未审核：主命名空间有，但没有对应 Status 页面
    const reviewedMainTitles = new Set(statusTitleToMain.values());
    const unreviewed = mainPages.filter(p => !reviewedMainTitles.has(p.title));

    // 孤立 Status：Status 页面存在，但其对应主页面不在主命名空间中（可能已删除或是重定向被过滤）
    const orphanedStatus = statusPages.filter(sp => {
      const mainTitle = statusTitleToMain.get(sp.title);
      return mainTitle && !mainTitles.has(mainTitle);
    });

    // 返回结果，并设置响应头禁止缓存
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
