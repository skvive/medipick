import { publicCatalogStore } from '@/lib/medipick/public-catalog';

/**
 * Public, read-only Blogger feed for a manually activated premium catalog storefront.
 * No private OAuth, no arbitrary remote URLs and no third-party article HTML.
 * Published posts remain third-party content, never clinically validated by MediPick.
 */
type Context = { params: Promise<{ id: string }> };
type BloggerEntry = {
  title?: { $t?: string };
  published?: { $t?: string };
  summary?: { $t?: string };
  content?: { $t?: string };
  link?: Array<{ href?: string; rel?: string }>;
};
const noStore = { 'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=300' };
function asText(input: unknown) {
  return String(input ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();
}
function allowBlog(raw: string): URL | null {
  try {
    const u=new URL(raw);
    if(u.protocol!=='https:' || u.username || u.password || u.port || !u.hostname.endsWith('.blogspot.com')) return null;
    return new URL('https://'+u.hostname+'/feeds/posts/default?alt=json&max-results=6');
  } catch { return null; }
}
export async function GET(_req: Request, ctx: Context) {
  const { id } = await ctx.params;
  if(!/^\d{1,9}$/.test(id) || Number(id) < 1) return Response.json({ error:'올바른 병원 ID가 아닙니다' },{status:400});
  try {
    const store=await publicCatalogStore(Number(id));
    if(!store.is_premium || store.ui.variant!=='premium') {
      return Response.json({ error:'입점 승인된 스마트스토어만 공개됩니다' },{status:403,headers:{'Cache-Control':'no-store'}});
    }
    const blog = allowBlog(String(store.ui.google_blog_url || ''));
    if(!blog) return Response.json({ items:[], enabled:false, note:'공개 Blogger 블로그가 연결되지 않았습니다. 관리자 승인 후 노출됩니다.' }, { headers:noStore });
    try {
      const response=await fetch(blog.toString(),{
        method:'GET',headers:{Accept:'application/json'},redirect:'error',
        signal:AbortSignal.timeout(4500),cache:'no-store',
      });
      if(!response.ok || Number(response.headers.get('content-length') || '0') > 800_000) throw new Error('feed unavailable');
      const raw=await response.text();
      if(raw.length>800_000)throw new Error('feed too large');
      const doc=JSON.parse(raw) as { feed?: { entry?: BloggerEntry[] } };
      const entries=Array.isArray(doc.feed?.entry) ? doc.feed!.entry!.slice(0,6) : [];
      const posts=entries.flatMap((post)=>{
        const href=post.link?.find(l=>l.rel==='alternate')?.href || '';
        try {
          const link=new URL(href);
          if(link.protocol!=='https:' || link.hostname!==blog.hostname) return [];
          return [{
            title:asText(post.title?.$t).slice(0,110) || '제목 없음',
            summary:asText(post.summary?.$t || post.content?.$t).slice(0,190),
            published:String(post.published?.$t || '').slice(0,10),
            url:link.toString(),
          }];
        } catch { return []; }
      });
      return Response.json({items:posts,enabled:true,source:blog.origin,note:'외부 Blogger 공개글입니다. 메디픽이 의료적 정확성을 감수한 것은 아닙니다.'},{headers:noStore});
    } catch {
      return Response.json({items:[],enabled:true,source:blog.origin,note:'Blogger 공개글을 현재 불러올 수 없습니다. 원문 링크에서 확인하세요.'},{headers:noStore});
    }
  } catch {
    return Response.json({error:'병원 스마트스토어를 찾을 수 없습니다'},{status:404,headers:{'Cache-Control':'no-store'}});
  }
}
