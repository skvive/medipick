import {isHiraConfigured,queryHira,allowRequest} from '@/lib/medipick/hira-client';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const ip=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 if(!allowRequest('status:'+ip))return Response.json({ok:false,code:'RATE_LIMIT',message:'잠시 후 다시 확인해 주세요.'},{status:429,headers:{'Cache-Control':'no-store'}});
 if(!isHiraConfigured())return Response.json({ok:false,configured:false,code:'NOT_CONFIGURED',source:'공공데이터포털·HIRA 병원정보서비스 v2'},{status:503,headers:{'Cache-Control':'no-store'}});
 const data=await queryHira({pageNo:1,numOfRows:1});
 return Response.json({ok:data.ok,configured:true,code:data.code,message:data.message,checkedAt:data.checkedAt,recordsReturned:data.items.length,total:data.total,source:'HIRA 병원정보서비스 v2',endpoint:'getHospBasisList',note:'HIRA 운영정보는 별도 확인이 필요하며 요청한 키는 브라우저에 노출하지 않습니다.'},{status:data.ok?200:502,headers:{'Cache-Control':'public,s-maxage=180,stale-while-revalidate=300'}});
}