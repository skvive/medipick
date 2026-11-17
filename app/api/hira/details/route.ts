import {allowRequest,isHiraDetailsConfigured,queryHiraDetails} from '@/lib/medipick/hira-client';
export const runtime='nodejs';
export const preferredRegion='icn1';
export const maxDuration=25;
export const dynamic='force-dynamic';

export async function GET(request:Request){
 const ip=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 if(!allowRequest('hira-details:'+ip)){
   return Response.json({ok:false,code:'RATE_LIMIT',message:'상세정보 요청이 많습니다. 잠시 후 재시도하세요.'},{status:429,headers:{'Cache-Control':'no-store'}});
 }
 if(!isHiraDetailsConfigured()){
   return Response.json({ok:false,code:'NOT_CONFIGURED',message:'HIRA 의료기관 상세정보 API 설정이 필요합니다.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
 const id=(new URL(request.url).searchParams.get('id')||'').trim();
 if(!/^[A-Za-z0-9+\/_=-]{16,160}$/.test(id)){
   return Response.json({ok:false,code:'INVALID_ID',message:'유효하지 않은 병원 식별정보입니다.'},{status:400,headers:{'Cache-Control':'no-store'}});
 }
 const details=await queryHiraDetails(id);
 return Response.json(details,{status:details.ok?200:502,headers:{'Cache-Control':'public,s-maxage=600,stale-while-revalidate=900'}});
}
