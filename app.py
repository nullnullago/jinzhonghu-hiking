# -*- coding: utf-8 -*-
"""中山联通2026年金钟湖健步行 - Flask 主应用"""

import os
import io
from datetime import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, jsonify,
    send_file, session, redirect, url_for
)

import config as cfg
from database import (
    init_db, get_all_teams, get_teams_with_counts,
    register_user, get_user_by_bib, get_user_by_id,
    checkin_start, checkin_end, get_rankings, get_stats,
    get_all_users, export_csv, batch_import_users,
    add_team, update_team, delete_team
)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'zhongshan-hiking-2026-secret-key')

# ---------- 初始化 ----------
with app.app_context():
    init_db()
    # 初始化队伍数据
    from database import get_db as _get_db
    conn = _get_db()
    for t in cfg.config['teams']:
        conn.execute(
            'INSERT OR IGNORE INTO teams (id, name, emoji, color) VALUES (?, ?, ?, ?)',
            (t['id'], t['name'], t['emoji'], t['color'])
        )
    conn.commit()
    conn.close()

# ---------- Jinja2 全局变量 ----------
@app.context_processor
def inject_config():
    return {
        'activity': cfg.config['activity'],
        'teams': cfg.config['teams'],
        'team_map': {t['id']: t for t in cfg.config['teams']},
    }


def format_duration(seconds):
    """将秒数格式化为 时:分:秒"""
    if seconds is None:
        return '-'
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f'{h}小时{m}分{s}秒'
    return f'{m}分{s}秒'


app.jinja_env.globals['format_duration'] = format_duration


# ---------- 管理员验证装饰器 ----------
def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.is_json or request.path.startswith('/api/'):
            pwd = request.args.get('password') or (request.get_json(silent=True) or {}).get('password', '')
            if pwd != cfg.config['adminPassword']:
                return jsonify({'success': False, 'message': '密码错误'}), 403
        else:
            if not session.get('admin_authenticated'):
                return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated


# =================== 页面路由 ===================

@app.route('/')
def index():
    """活动首页"""
    return render_template('index.html', page='home')


@app.route('/register')
def register_page():
    """报名页面"""
    return render_template('index.html', page='register')


@app.route('/checkin/<checkin_type>')
def checkin_page(checkin_type):
    """打卡页面 (start / end)"""
    if checkin_type not in ('start', 'end'):
        return redirect(url_for('index'))
    return render_template('index.html', page='checkin', checkin_type=checkin_type)


@app.route('/query')
def query_page():
    """成绩查询页面"""
    return render_template('index.html', page='query')


@app.route('/rankings')
def rankings_page():
    """队伍排行页面"""
    return render_template('index.html', page='rankings')


@app.route('/admin/login')
def admin_login():
    """管理后台登录页"""
    return render_template('admin.html', page='login')


@app.route('/admin')
def admin():
    """管理后台"""
    if not session.get('admin_authenticated'):
        return redirect(url_for('admin_login'))
    return render_template('admin.html', page='dashboard')


# =================== API 路由 ===================

@app.route('/api/config')
def api_config():
    """获取活动配置和队伍列表"""
    return jsonify({
        'success': True,
        'activity': cfg.config['activity'],
        'teams': cfg.config['teams'],
    })


@app.route('/api/teams')
def api_teams():
    """获取所有队伍及报名人数"""
    teams = get_teams_with_counts()
    return jsonify({'success': True, 'teams': teams})


@app.route('/api/register', methods=['POST'])
def api_register():
    """用户报名"""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    team_id = data.get('team_id')

    if not name:
        return jsonify({'success': False, 'message': '请输入姓名'}), 400
    if not phone or len(phone) != 11 or not phone.isdigit():
        return jsonify({'success': False, 'message': '请输入正确的11位手机号'}), 400
    if not team_id or team_id not in [t['id'] for t in cfg.config['teams']]:
        return jsonify({'success': False, 'message': '请选择参赛队伍'}), 400

    try:
        bib_number = register_user(name, phone, team_id)
        team = cfg.config['teams'][team_id - 1]
        return jsonify({
            'success': True,
            'message': '报名成功！',
            'data': {
                'bib_number': bib_number,
                'name': name,
                'team_name': team['name'],
                'team_emoji': team['emoji'],
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'报名失败：{str(e)}'}), 500


@app.route('/api/user/<identifier>')
def api_user(identifier):
    """查询用户信息（支持参赛编号或用户ID）"""
    user = get_user_by_bib(identifier) or get_user_by_id(identifier)
    if not user:
        return jsonify({'success': False, 'message': '未找到该参与者信息'}), 404
    return jsonify({'success': True, 'user': user})


@app.route('/api/checkin/start', methods=['POST'])
def api_checkin_start():
    """起点打卡"""
    data = request.get_json() or {}
    bib_number = (data.get('bib_number') or '').strip().upper()
    if not bib_number:
        return jsonify({'success': False, 'message': '请输入参赛编号'}), 400

    ok, msg, user = checkin_start(bib_number)
    return jsonify({'success': ok, 'message': msg, 'user': user})


@app.route('/api/checkin/end', methods=['POST'])
def api_checkin_end():
    """终点打卡"""
    data = request.get_json() or {}
    bib_number = (data.get('bib_number') or '').strip().upper()
    if not bib_number:
        return jsonify({'success': False, 'message': '请输入参赛编号'}), 400

    ok, msg, user = checkin_end(bib_number)
    return jsonify({'success': ok, 'message': msg, 'user': user})


@app.route('/api/rankings')
def api_rankings():
    """队伍排行榜"""
    rankings = get_rankings()
    return jsonify({'success': True, 'rankings': rankings})


# ---------- 管理后台 API ----------

@app.route('/api/admin/login', methods=['POST'])
def api_admin_login():
    data = request.get_json() or {}
    pwd = data.get('password', '')
    if pwd == cfg.config['adminPassword']:
        session['admin_authenticated'] = True
        return jsonify({'success': True, 'message': '登录成功'})
    return jsonify({'success': False, 'message': '密码错误'}), 403


@app.route('/api/admin/logout', methods=['POST'])
def api_admin_logout():
    session.pop('admin_authenticated', None)
    return jsonify({'success': True})


@app.route('/api/admin/stats')
@admin_required
def api_admin_stats():
    stats = get_stats()
    return jsonify({'success': True, 'stats': stats})


@app.route('/api/admin/users')
@admin_required
def api_admin_users():
    users = get_all_users()
    return jsonify({'success': True, 'users': users})


@app.route('/api/admin/users/import', methods=['POST'])
@admin_required
def api_admin_users_import():
    """批量导入用户（支持 JSON 和 CSV 文件上传）"""
    import csv

    users_data = []

    # 方式1: JSON 格式
    file = request.files.get('file')
    if file:
        filename = file.filename or ''
        if filename.lower().endswith('.csv'):
            # 解析 CSV
            stream = io.StringIO(file.read().decode('utf-8-sig'))
            reader = csv.DictReader(stream)
            for row in reader:
                users_data.append({
                    'name': row.get('姓名', row.get('name', '')).strip(),
                    'phone': row.get('手机号', row.get('phone', '')).strip(),
                    'team_id': row.get('队伍ID', row.get('team_id', '')).strip()
                })
        elif filename.lower().endswith('.json'):
            import json
            data = json.loads(file.read().decode('utf-8'))
            if isinstance(data, list):
                users_data = data
            else:
                return jsonify({'success': False, 'message': 'JSON 文件格式错误：应为用户数组'}), 400
        else:
            return jsonify({'success': False, 'message': '不支持的文件格式，请上传 CSV 或 JSON 文件'}), 400
    else:
        # 方式2: 请求体 JSON 数组
        data = request.get_json(silent=True)
        if data and isinstance(data, list):
            users_data = data
        else:
            return jsonify({'success': False, 'message': '请上传文件或提供用户数据'}), 400

    if not users_data:
        return jsonify({'success': False, 'message': '未解析到任何用户数据'}), 400

    results = batch_import_users(users_data)
    return jsonify({'success': True, 'results': results})


# ---------- 队伍管理 API ----------

@app.route('/api/admin/teams')
@admin_required
def api_admin_teams():
    """获取所有队伍"""
    teams = get_all_teams()
    # 附加每个队伍的成员数
    for t in teams:
        from database import get_db as _db
        conn = _db()
        t['member_count'] = conn.execute('SELECT COUNT(*) FROM users WHERE team_id = ?', (t['id'],)).fetchone()[0]
        conn.close()
    return jsonify({'success': True, 'teams': teams})


@app.route('/api/admin/teams', methods=['POST'])
@admin_required
def api_admin_teams_add():
    """新增队伍"""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    emoji = (data.get('emoji') or '').strip()
    color = (data.get('color') or '#333').strip()

    if not name:
        return jsonify({'success': False, 'message': '队伍名称不能为空'}), 400

    team_id = add_team(name, emoji, color)
    return jsonify({'success': True, 'team_id': team_id, 'message': f'队伍「{name}」创建成功'})


@app.route('/api/admin/teams/<int:team_id>', methods=['PUT'])
@admin_required
def api_admin_teams_update(team_id):
    """更新队伍"""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    emoji = (data.get('emoji') or '').strip()
    color = (data.get('color') or '#333').strip()

    if not name:
        return jsonify({'success': False, 'message': '队伍名称不能为空'}), 400

    update_team(team_id, name, emoji, color)
    return jsonify({'success': True, 'message': '队伍信息已更新'})


@app.route('/api/admin/teams/<int:team_id>', methods=['DELETE'])
@admin_required
def api_admin_teams_delete(team_id):
    """删除队伍"""
    ok, msg = delete_team(team_id)
    if ok:
        return jsonify({'success': True, 'message': msg})
    else:
        return jsonify({'success': False, 'message': msg}), 400


@app.route('/api/admin/export')
@admin_required
def api_admin_export():
    csv_data = export_csv()
    buf = io.BytesIO()
    buf.write(csv_data.encode('utf-8-sig'))
    buf.seek(0)
    return send_file(
        buf,
        mimetype='text/csv',
        as_attachment=True,
        download_name=f'健步行数据_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    )


@app.route('/api/admin/qrcode/<qrcode_type>')
@admin_required
def api_admin_qrcode(qrcode_type):
    """生成打卡二维码 (start / end)"""
    if qrcode_type not in ('start', 'end'):
        return jsonify({'success': False, 'message': '类型错误'}), 400

    base_url = request.args.get('url', '').strip()
    if not base_url:
        base_url = request.host_url.rstrip('/')

    checkin_url = f'{base_url}/checkin/{qrcode_type}'

    try:
        import qrcode as qr
    except ImportError:
        # fallback: 用纯 Python 生成简单二维码
        return _generate_qrcode_fallback(checkin_url, qrcode_type)

    img = qr.make_image(checkin_url, error_correction=qr.constants.ERROR_CORRECT_H, box_size=12, border=2)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


def _generate_qrcode_fallback(data, qrcode_type):
    """纯 Python 二维码生成（无需 qrcode 库）"""
    # 使用 Google Charts API 作为后备方案
    import urllib.request
    import urllib.parse
    url = f'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data={urllib.parse.quote(data)}'
    try:
        with urllib.request.urlopen(url) as resp:
            img_data = resp.read()
        buf = io.BytesIO(img_data)
        buf.seek(0)
        return send_file(buf, mimetype='image/png')
    except Exception:
        return jsonify({'success': False, 'message': '二维码生成失败'}), 500


# =================== 启动 ===================

if __name__ == '__main__':
    svr = cfg.config['server']
    print(f"""
╔══════════════════════════════════════════╗
║   🏃 行稳致远共奋进 - 金钟湖健步行        ║
║   中山联通 2026                          ║
║                                          ║
║   主应用:  http://localhost:{svr['port']}     ║
║   管理后台: http://localhost:{svr['port']}/admin ║
║   默认密码: {cfg.config['adminPassword']}        ║
╚══════════════════════════════════════════╝
    """)
    app.run(host=svr['host'], port=svr['port'], debug=svr['debug'])