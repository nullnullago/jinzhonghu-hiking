# -*- coding: utf-8 -*-
"""SQLite 数据库操作模块"""

import sqlite3
import os
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data', 'activity.db')


def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """初始化数据库表"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            team_id INTEGER NOT NULL,
            bib_number TEXT UNIQUE NOT NULL,
            start_time TEXT,
            end_time TEXT,
            duration INTEGER,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            emoji TEXT DEFAULT '',
            color TEXT DEFAULT '#333'
        );
    ''')
    conn.commit()
    conn.close()


def get_team(team_id):
    conn = get_db()
    row = conn.execute('SELECT * FROM teams WHERE id = ?', (team_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_teams():
    conn = get_db()
    rows = conn.execute('SELECT * FROM teams ORDER BY id').fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_team(name, emoji='', color='#333'):
    """添加新队伍"""
    conn = get_db()
    # 获取最大ID
    max_id = conn.execute('SELECT MAX(id) FROM teams').fetchone()[0] or 0
    new_id = max_id + 1
    
    conn.execute(
        'INSERT INTO teams (id, name, emoji, color) VALUES (?, ?, ?, ?)',
        (new_id, name, emoji, color)
    )
    conn.commit()
    conn.close()
    return new_id


def update_team(team_id, name, emoji, color):
    """更新队伍信息"""
    conn = get_db()
    conn.execute(
        'UPDATE teams SET name = ?, emoji = ?, color = ? WHERE id = ?',
        (name, emoji, color, team_id)
    )
    conn.commit()
    conn.close()
    return True


def delete_team(team_id):
    """删除队伍（需要先删除关联用户）"""
    conn = get_db()
    # 检查是否有用户关联
    user_count = conn.execute('SELECT COUNT(*) FROM users WHERE team_id = ?', (team_id,)).fetchone()[0]
    if user_count > 0:
        conn.close()
        return False, f'该队伍还有 {user_count} 名成员，无法删除'
    
    conn.execute('DELETE FROM teams WHERE id = ?', (team_id,))
    conn.commit()
    conn.close()
    return True, '删除成功'


def get_teams_with_counts():
    conn = get_db()
    rows = conn.execute('''
        SELECT t.*, COUNT(u.id) AS member_count
        FROM teams t
        LEFT JOIN users u ON u.team_id = t.id
        GROUP BY t.id
        ORDER BY t.id
    ''').fetchall()
    conn.close()
    return [dict(r) for r in rows]


def register_user(name, phone, team_id):
    conn = get_db()
    # 生成参赛编号: ZSLT + 年月日 + 3位序号
    date_str = datetime.now().strftime('%m%d')
    count = conn.execute(
        'SELECT COUNT(*) FROM users WHERE bib_number LIKE ?',
        (f'ZSLT{date_str}%',)
    ).fetchone()[0]
    bib_number = f'ZSLT{date_str}{count + 1:03d}'

    conn.execute(
        'INSERT INTO users (name, phone, team_id, bib_number) VALUES (?, ?, ?, ?)',
        (name, phone, team_id, bib_number)
    )
    conn.commit()
    conn.close()
    return bib_number


def get_user_by_bib(bib_number):
    conn = get_db()
    row = conn.execute(
        'SELECT u.*, t.name AS team_name, t.emoji AS team_emoji, t.color AS team_color '
        'FROM users u JOIN teams t ON u.team_id = t.id '
        'WHERE u.bib_number = ?', (bib_number,)
    ).fetchone()
    conn.close()
    if row:
        d = dict(row)
        if d.get('start_time'):
            d['start_time'] = d['start_time'].replace('T', ' ')
        if d.get('end_time'):
            d['end_time'] = d['end_time'].replace('T', ' ')
        return d
    return None


def get_user_by_id(user_id):
    conn = get_db()
    row = conn.execute(
        'SELECT u.*, t.name AS team_name, t.emoji AS team_emoji, t.color AS team_color '
        'FROM users u JOIN teams t ON u.team_id = t.id '
        'WHERE u.id = ?', (user_id,)
    ).fetchone()
    conn.close()
    if row:
        d = dict(row)
        if d.get('start_time'):
            d['start_time'] = d['start_time'].replace('T', ' ')
        if d.get('end_time'):
            d['end_time'] = d['end_time'].replace('T', ' ')
        return d
    return None


def checkin_start(bib_number):
    """起点打卡，返回 (success, message, user_data)"""
    user = get_user_by_bib(bib_number)
    if not user:
        return False, '参赛编号不存在，请确认后重试', None
    if user['start_time']:
        return False, f'您已于 {user["start_time"]} 完成起点打卡，无需重复打卡', None

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    conn.execute('UPDATE users SET start_time = ? WHERE bib_number = ?', (now, bib_number))
    conn.commit()
    conn.close()
    user['start_time'] = now
    return True, '起点打卡成功！祝您健步愉快！', user


def checkin_end(bib_number):
    """终点打卡，返回 (success, message, user_data)"""
    user = get_user_by_bib(bib_number)
    if not user:
        return False, '参赛编号不存在，请确认后重试', None
    if not user['start_time']:
        return False, '请先在起点完成打卡', None
    if user['end_time']:
        return False, '您已完成终点打卡，无需重复打卡', None

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    start_dt = datetime.strptime(user['start_time'], '%Y-%m-%d %H:%M:%S')
    end_dt = datetime.strptime(now, '%Y-%m-%d %H:%M:%S')
    duration = int((end_dt - start_dt).total_seconds())

    conn = get_db()
    conn.execute(
        'UPDATE users SET end_time = ?, duration = ? WHERE bib_number = ?',
        (now, duration, bib_number)
    )
    conn.commit()
    conn.close()

    user['end_time'] = now
    user['duration'] = duration
    return True, '终点打卡成功！恭喜完成健步行！', user


def get_rankings():
    """获取队伍排行榜（已完成终点打卡的队伍按平均用时排名）"""
    conn = get_db()
    rows = conn.execute('''
        SELECT t.id, t.name, t.emoji, t.color,
               COUNT(u.id) AS total_members,
               COUNT(u.end_time) AS finished,
               ROUND(AVG(u.duration), 0) AS avg_duration
        FROM teams t
        LEFT JOIN users u ON u.team_id = t.id
        GROUP BY t.id
        ORDER BY
            CASE WHEN COUNT(u.end_time) = 0 THEN 1 ELSE 0 END,
            AVG(u.duration) ASC,
            t.id ASC
    ''').fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_stats():
    conn = get_db()
    total = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    started = conn.execute('SELECT COUNT(*) FROM users WHERE start_time IS NOT NULL').fetchone()[0]
    finished = conn.execute('SELECT COUNT(*) FROM users WHERE end_time IS NOT NULL').fetchone()[0]
    conn.close()
    return {'total': total, 'started': started, 'finished': finished}


def get_all_users():
    conn = get_db()
    rows = conn.execute('''
        SELECT u.*, t.name AS team_name
        FROM users u
        JOIN teams t ON u.team_id = t.id
        ORDER BY u.id DESC
    ''').fetchall()
    conn.close()
    return [dict(r) for r in rows]


def export_csv():
    import csv
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['参赛编号', '姓名', '手机号', '队伍', '起点打卡时间', '终点打卡时间', '用时(秒)'])

    conn = get_db()
    rows = conn.execute('''
        SELECT u.bib_number, u.name, u.phone, t.name AS team_name,
               u.start_time, u.end_time, u.duration
        FROM users u JOIN teams t ON u.team_id = t.id
        ORDER BY u.id
    ''').fetchall()
    conn.close()

    for r in rows:
        writer.writerow([
            r['bib_number'], r['name'], r['phone'], r['team_name'],
            r['start_time'] or '', r['end_time'] or '', r['duration'] or ''
        ])
    return output.getvalue()


def batch_import_users(users_data):
    """批量导入用户
    users_data: list of dict, 每个dict包含 name, phone, team_id
    """
    conn = get_db()
    cursor = conn.cursor()
    results = {'success': 0, 'failed': 0, 'errors': []}
    
    for i, user in enumerate(users_data):
        try:
            name = user.get('name', '').strip()
            phone = user.get('phone', '').strip()
            team_id = int(user.get('team_id', 0))
            
            if not name or not phone or not team_id:
                results['errors'].append(f'第{i+1}行: 姓名、手机号、队伍ID不能为空')
                results['failed'] += 1
                continue
            
            # 检查手机号是否已存在
            existing = cursor.execute(
                'SELECT id FROM users WHERE phone = ?', (phone,)
            ).fetchone()
            if existing:
                results['errors'].append(f'第{i+1}行: 手机号 {phone} 已存在')
                results['failed'] += 1
                continue
            
            # 生成参赛编号
            date_str = datetime.now().strftime('%m%d')
            count = cursor.execute(
                'SELECT COUNT(*) FROM users WHERE bib_number LIKE ?',
                (f'ZSLT{date_str}%',)
            ).fetchone()[0]
            bib_number = f'ZSLT{date_str}{count + 1:03d}'
            
            cursor.execute(
                'INSERT INTO users (name, phone, team_id, bib_number) VALUES (?, ?, ?, ?)',
                (name, phone, team_id, bib_number)
            )
            results['success'] += 1
            
        except Exception as e:
            results['errors'].append(f'第{i+1}行: {str(e)}')
            results['failed'] += 1
    
    conn.commit()
    conn.close()
    return results