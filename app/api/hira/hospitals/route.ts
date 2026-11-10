import {allowRequest,isHiraConfigured,queryHira} from '@/lib/medipick/hira-client';
export const runtime='nodejs';
export const maxDuration=25; // HIRA government API occasionally exceeds the former 8.5-second budget.
export const preferredRegion='icn1'; // Keep HIRA government API calls in Seoul, not default US iad1.
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const ip=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 if(!allowRequest('search:'+ip))return Response.json({ok:false,code:'RATE_LIMIT',items:[],message:'요청이 많습니다. 잠시 후 다시 검색해 주세요.'},{status:429,headers:{'Cache-Control':'no-store'}});
 if(!isHiraConfigured())return Response.json({ok:false,code:'NOT_CONFIGURED',items:[],message:'공식 API 인증 설정을 확인하고 있습니다.'},{status:503,headers:{'Cache-Control':'no-store'}});
 const u=new URL(request.url), q=(u.searchParams.get('q')||'').trim().slice(0,80);
 const latRaw=u.searchParams.get('lat'),lngRaw=u.searchParams.get('lng');
 const lat=latRaw!==null?Number(latRaw):undefined,lng=lngRaw!==null?Number(lngRaw):undefined;
 const coord=Number.isFinite(lat)&&Number.isFinite(lng)&&lat!>=32&&lat!<=39&&lng!>=124&&lng!<=132;
 if(!coord&&!q)return Response.json({ok:false,code:'INPUT_REQUIRED',items:[],message:'병원명 또는 한국 내 좌표가 필요합니다.'},{status:400});
 const radius=Math.min(30000,Math.max(500,Number(u.searchParams.get('radius')||2000)||2000));
 const data=await queryHira({q,lat:coord?lat:undefined,lng:coord?lng:undefined,radius,pageNo:1,numOfRows:20});
 // HIRA response coordinate radius must also be verified server-side;
 // upstream filtering can be incomplete and unverified records must never become map pins.
 const insideRadius=coord?data.items.filter(item=>
   item.coordinateSource==='HIRA_API' && item.distanceKm!==null &&
   Number.isFinite(item.distanceKm) && item.distanceKm<=radius/1000
 ):data.items;
 return Response.json({ok:data.ok,code:data.code,message:data.message,items:insideRadius,total:data.total,checkedAt:data.checkedAt,source:'건강보험심사평가원 병원정보서비스',officialSourceUrl:'https://www.data.go.kr/data/15001698/openapi.do',precisionNote:'HIRA가 제공한 좌표만 표시하며 주소록 추정 좌표를 사용하지 않습니다. 방문 전 병원에 확인하세요.'},{status:data.ok?200:502,headers:{'Cache-Control':'public,s-maxage=120,stale-while-revalidate=300'}});
}