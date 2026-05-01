import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';   // 确保路由每次执行

interface PageInfo { /* ... */ }
interface FailedPageInfo { /* ... */ }
interface AuditResult { /* ... */ }

const API_BASE = 'https://mirror.backroomszh.org/w/api.php';
const STATUS_NS = 5508;
const MAIN_NS = 0;

// 1. 获取所有非重定向页面（示例）
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

    // ✅ 关键：添加 { cache: 'no-store' } 禁止 Next.js 缓存
    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      cache: 'no-store',
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

// 2. 过滤重定向（也需要禁用缓存）
async function filterOutRedirects(pages: PageInfo[]): Promise<PageInfo[]> {
  // ... 内部 fetch 同样加 { cache: 'no-store' }
}

// 3. 获取未过审页面
async function fetchFailedPages(): Promise<FailedPageInfo[]> {
  let failed: FailedPageInfo[] = [];
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
      cache: 'no-store',   // ✅ 禁用 Next.js 数据缓存
    });
    if (!res.ok) throw new Error(`分类API请求失败: ${res.status}`);
    const data = await res.json();
    // ... 处理
  } while (gcmcontinue);

  return failed;
}

// 主处理函数
export async function GET() {
  try {
    const mainPages = await fetchAllNonRedirectPages(MAIN_NS);
    // ... 其他调用也要加上 { cache: 'no-store' }
    // 注意：Status 页面获取部分也要修改

    return NextResponse.json(
      { unreviewed, failed: failedPages, orphanedStatus },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    // ...
  }
}
