import { NextResponse } from 'next/server';

interface PageInfo {
  pageid: number;
  ns: number;
  title: string;
}

interface FailedPageInfo {
  pageid: number;
  title: string;
  timestamp: string;
}

interface AuditResult {
  unreviewed: PageInfo[];
  failed: FailedPageInfo[];
  orphanedStatus: PageInfo[];
}

const API_BASE = 'https://mirror.backroomszh.org/w/api.php';
const STATUS_NS = 5508;
const MAIN_NS = 0;

// 1. 分页获取指定命名空间的所有非重定向页面
async function fetchAllNonRedirectPages(namespace: number): Promise<PageInfo[]> {
  let pages: PageInfo[] = [];
  let apcontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      list: 'allpages',
      apnamespace: String(namespace),
      aplimit: 'max',
      apfilterredir: 'nonredirects', // 排除重定向
      format: 'json',
    });
    if (apcontinue) params.append('apcontinue', apcontinue);

    const res = await fetch(`${API_BASE}?${params.toString()}`);
    if (!res.ok) throw new Error(`API请求失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.allpages) {
      pages = pages.concat(data.query.allpages);
    }
    apcontinue = data.continue?.apcontinue ?? null;
  } while (apcontinue);

  return pages;
}

// 2. 过滤掉重定向页面（用于从已获取的列表中排除）
async function filterOutRedirects(pages: PageInfo[]): Promise<PageInfo[]> {
  if (pages.length === 0) return [];
  
  // 分批查询，每次最多50个页面（MediaWiki API限制）
  const nonRedirects: PageInfo[] = [];
  
  for (let i = 0; i < pages.length; i += 50) {
    const batch = pages.slice(i, i + 50);
    const titles = batch.map(p => p.title).join('|');
    
    const params = new URLSearchParams({
      action: 'query',
      titles: titles,
      prop: 'info',
      format: 'json',
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`);
    if (!res.ok) throw new Error(`重定向检查API失败: ${res.status}`);
    const data = await res.json();
    
    if (data.query?.pages) {
      for (const [, page] of Object.entries(data.query.pages) as any) {
        if (page.redirect === undefined) {
          // 不是重定向
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

// 3. 获取未过审页面（排除重定向）
async function fetchFailedPages(): Promise<FailedPageInfo[]> {
  let failed: FailedPageInfo[] = [];
  let gcmcontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: 'Category:未过审页面',
      gcmtype: 'page', // 只获取页面，排除子分类和文件
      prop: 'info|revisions',
      rvprop: 'timestamp',
      format: 'json',
    });
    if (gcmcontinue) params.append('gcmcontinue', gcmcontinue);

    const res = await fetch(`${API_BASE}?${params.toString()}`);
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

// 主处理函数
export async function GET() {
  try {
    // 获取主命名空间的非重定向页面
    const mainPages = await fetchAllNonRedirectPages(MAIN_NS);
    
    // 获取Status命名空间的所有页面（先不过滤，后面会过滤）
    let statusPagesAll: PageInfo[] = [];
    let apcontinue: string | null = null;
    
    do {
      const params = new URLSearchParams({
        action: 'query',
        list: 'allpages',
        apnamespace: String(STATUS_NS),
        aplimit: 'max',
        format: 'json',
      });
      if (apcontinue) params.append('apcontinue', apcontinue);

      const res = await fetch(`${API_BASE}?${params.toString()}`);
      if (!res.ok) throw new Error(`Status命名空间API请求失败: ${res.status}`);
      const data = await res.json();

      if (data.query?.allpages) {
        statusPagesAll = statusPagesAll.concat(data.query.allpages);
      }
      apcontinue = data.continue?.apcontinue ?? null;
    } while (apcontinue);
    
    // 过滤掉Status命名空间中的重定向页面
    const statusPages = await filterOutRedirects(statusPagesAll);
    
    // 获取未过审页面（已过滤重定向）
    const failedPages = await fetchFailedPages();

    // 构建映射关系
    const mainTitles = new Set(mainPages.map(p => p.title));
    const statusTitleToMain = new Map<string, string>();
    for (const sp of statusPages) {
      if (sp.title.startsWith('Status:')) {
        const mainTitle = sp.title.slice(7);
        statusTitleToMain.set(sp.title, mainTitle);
      }
    }

    // 未审核：主命名空间页面但无Status页面（重定向已在获取时排除）
    const reviewedMainTitles = new Set(statusTitleToMain.values());
    const unreviewed = mainPages.filter(p => !reviewedMainTitles.has(p.title));

    // 孤立Status：Status页面但其对应主页面不存在（或主页面是重定向已被排除）
    const orphanedStatus = statusPages.filter(sp => {
      const mainTitle = statusTitleToMain.get(sp.title);
      return mainTitle && !mainTitles.has(mainTitle);
    });

    return NextResponse.json({
      unreviewed,
      failed: failedPages,
      orphanedStatus,
    } satisfies AuditResult);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || '未知错误' }, { status: 500 });
  }
}
