#!/usr/bin/env python3
"""Import metadata of doctor-owned Blogger RSS/Atom feed after permission.
External posts are moderation-pending; copyrights stay with content creators.
Only blogspot.com HTTPS feed endpoints are fetched (SSRF restriction).
"""
import sys, argparse, urllib.parse, urllib.request, xml.etree.ElementTree as ET, re, html
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import db,init_db,now

def parse_feed(raw):
    root=ET.fromstring(raw)
    items=[]
    if root.tag.endswith('feed'):
        atom='{http://www.w3.org/2005/Atom}'
        for entry in root.findall(atom+'entry'):
            title=entry.findtext(atom+'title') or ''
            uri=next((l.get('href') for l in entry.findall(atom+'link') if l.get('rel')=='alternate'),'')
            summary=entry.findtext(atom+'summary') or entry.findtext(atom+'content') or ''
            author=entry.findtext(atom+'author/'+atom+'name') or ''
            items.append({'title':title,'url':uri,'summary':re.sub('<[^>]*>','',html.unescape(summary))[:900], 'author':author})
    else:
        for item in root.findall('.//item'):
            summary=item.findtext('description') or ''
            items.append({'title':item.findtext('title') or '', 'url':item.findtext('link') or '',
                'summary':re.sub('<[^>]*>','',html.unescape(summary))[:900], 'author':''})
    return items

def fetch_blog(blog):
    p=urllib.parse.urlsplit(blog)
    if p.scheme!='https' or not p.hostname or not p.hostname.endswith('.blogspot.com') or p.hostname.count('.')<2:
        raise ValueError('https://{블로그}.blogspot.com 형식의 승인된 공개 블로그만 허용합니다')
    url='https://'+p.hostname+'/feeds/posts/default?alt=atom&max-results=30'
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'MEDIPICK/1.0'}),timeout=15) as r:return parse_feed(r.read(2_000_000))

def store(items,provider_id,category):
    created=0
    with db() as c:
        if not c.execute('SELECT 1 FROM providers WHERE id=?',(provider_id,)).fetchone():raise ValueError('의료기관 ID가 존재하지 않습니다')
        for x in items:
            if not x['url'].startswith('https://') or not x['title']:continue
            if c.execute('SELECT 1 FROM content WHERE provider_id=? AND url=?',(provider_id,x['url'])).fetchone():continue
            c.execute('INSERT INTO content(provider_id,title,summary,kind,category,url,author_label,approved,published_at) VALUES(?,?,?,?,?,?,?,?,?)',
                (provider_id,x['title'][:200],x['summary'],'blog',category,x['url'],x['author'][:100],0,now()))
            created+=1
    return created
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--blog',required=True);p.add_argument('--provider-id',type=int,required=True);p.add_argument('--category',required=True);a=p.parse_args()
    init_db();print('등록 후 검수 대기:',store(fetch_blog(a.blog),a.provider_id,a.category),'건')
