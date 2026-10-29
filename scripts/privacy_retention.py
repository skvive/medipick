"""Dry-run by default; delete only completed, declined or cancelled old booking records.
Review with privacy officer before any --apply. No external connectivity.
"""
import sys,argparse
from pathlib import Path
from datetime import datetime,timedelta,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import db,init_db

def execute(days=90,apply=False):
    if days<30:raise ValueError('보존기간은 30일 이상 설정하세요')
    cut=(datetime.now(timezone(timedelta(hours=9)))-timedelta(days=days)).isoformat()
    with db() as c:
        ids=[r['id'] for r in c.execute("SELECT id FROM appointments WHERE status IN ('completed','declined','cancelled') AND created_at < ?",(cut,))]
        if apply and ids:
            c.execute('BEGIN IMMEDIATE')
            c.executemany('DELETE FROM notifications WHERE appointment_id=?',[(x,) for x in ids])
            c.executemany('DELETE FROM appointments WHERE id=?',[(x,) for x in ids])
            c.commit()
    return {'candidate_count':len(ids),'deleted_count':len(ids) if apply else 0,'dry_run':not apply,'retention_days':days}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--days',type=int,default=90);parser.add_argument('--apply',action='store_true');args=parser.parse_args();init_db();print(execute(args.days,args.apply))
