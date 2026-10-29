#!/usr/bin/env python3
"""YouTube Data API v3: import only metadata of selected doctor-owned channel.
No downloading/rehosting user videos. Requires YOUTUBE_API_KEY and verified channel consent.
"""
import sys,os,json,argparse,urllib.parse,urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import db,init_db,now

def fetch(channel,max_results=20):
    key=os.getenv('YOUTUBE_API_KEY')
    if not key:raise ValueError('YOUTUBE_API_KEY가 필요합니다')
    if not channel.startswith('UC') or len(channel)<20:raise ValueError('공식 YouTube 채널 ID가 필요합니다')
    args={'key':key,'part':'snippet','channelId':channel,'type':'video','order':'date','maxResults':min(max_results,50)}
    url='https://www.googleapis.com/youtube/v3/search?'+urllib.parse.urlencode(args)
    with urllib.request.urlopen(url,timeout=20) as r:doc=json.loads(r.read(1_000_000))
    return [dict(video_id=x.get('id',{}).get('videoId',''),title=x.get('snippet',{}).get('title',''),
          summary=x.get('snippet',{}).get('description',''),author=x.get('snippet',{}).get('channelTitle','')) for x in doc.get('items',[])]

def store(videos,pid,category,shorts=False):
    created=0
    with db() as c:
        if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():raise ValueError('의료기관 ID 오류')
        for x in videos:
            vid=x['video_id'];url='https://www.youtube.com/watch?v='+vid
            if not vid or c.execute('SELECT 1 FROM content WHERE url=? AND provider_id=?',(url,pid)).fetchone():continue
            c.execute('INSERT INTO content(provider_id,title,summary,kind,category,url,author_label,approved,published_at) VALUES(?,?,?,?,?,?,?,?,?)',
                (pid,x['title'][:200],x['summary'][:1500],'shorts' if shorts else 'video',category,url,x['author'][:100],0,now()))
            created+=1
    return created
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--channel',required=True);p.add_argument('--provider-id',type=int,required=True);p.add_argument('--category',required=True);p.add_argument('--shorts',action='store_true');a=p.parse_args()
    init_db();print('의료광고 검수 대기:',store(fetch(a.channel),a.provider_id,a.category,a.shorts),'건')
