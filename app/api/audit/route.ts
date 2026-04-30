import { NextResponse } from 'next/server';
// 数据接口
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

// 1. 分页获取指定命名空间的所有页面
async function fetchAllPages(namespace: number): Promise<PageInfo[]> {
  let pages: PageInfo[] = [];
  let apcontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      list: 'allpages',
      apnamespace: String(namespace),
      aplimit: 'max',
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

// 2. 获取未过审页面列表（含有最后修改时间）
async function fetchFailedPages(): Promise<FailedPageInfo[]> {
  let failed: FailedPageInfo[] = [];
  let gcmcontinue: string | null = null;

  do {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: 'Category:未过审页面',
      prop: 'revisions',
      rvprop: 'timestamp',
      format: 'json',
    });
    if (gcmcontinue) params.append('gcmcontinue', gcmcontinue);

    const res = await fetch(`${API_BASE}?${params.toString()}`);
    if (!res.ok) throw new Error(`分类API请求失败: ${res.status}`);
    const data = await res.json();

    if (data.query?.pages) {
      for (const [, page] of Object.entries(data.query.pages) as any) {
        failed.push({
          pageid: page.pageid,
          title: page.title,
          timestamp: page.revisions?.[0]?.timestamp ?? '',
        });
      }
    }
    gcmcontinue = data.continue?.gcmcontinue ?? null;
  } while (gcmcontinue);

  return failed;
}

// 主处理函数
export async function GET() {
  try {
    // 并行请求以获得最佳性能
    const [mainPages, statusPages, failedPages] = await Promise.all([
      fetchAllPages(MAIN_NS),
      fetchAllPages(STATUS_NS),
      fetchFailedPages(),
    ]);

    // 构建映射关系
    const mainTitles = new Set(mainPages.map(p => p.title));
    const statusTitleToMain = new Map<string, string>();
    for (const sp of statusPages) {
      if (sp.title.startsWith('Status:')) {
        const mainTitle = sp.title.slice(7); // 移除'Status:'
        statusTitleToMain.set(sp.title, mainTitle);
      }
    }

    // 未审核：主命名空间页面但无 Status 页面
    const reviewedMainTitles = new Set(statusTitleToMain.values());
    const unreviewed = mainPages.filter(p => !reviewedMainTitles.has(p.title));

    // 孤立 Status：Status 页面但其对应主页面不存在
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
