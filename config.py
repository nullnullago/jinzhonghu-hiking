# -*- coding: utf-8 -*-
"""活动配置文件"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

config = {
    # 管理后台密码
    'adminPassword': 'zhongshan2026',

    # 活动信息
    'activity': {
        'name': '行稳致远共奋进',
        'subtitle': '中山联通2026年金钟湖健步行',
        'distance': '8KM',
        'date': '2026年5月22日',
        'participants': 200,
    },

    # 8支队伍配置
    'teams': [
        {'id': 1, 'name': '烈焰队', 'emoji': '🔥', 'color': '#FF6B6B'},
        {'id': 2, 'name': '乘风队', 'emoji': '🌊', 'color': '#4ECDC4'},
        {'id': 3, 'name': '雷霆队', 'emoji': '⚡', 'color': '#FFD93D'},
        {'id': 4, 'name': '先锋队', 'emoji': '🚀', 'color': '#6C5CE7'},
        {'id': 5, 'name': '飞跃队', 'emoji': '🦅', 'color': '#00B894'},
        {'id': 6, 'name': '超越队', 'emoji': '🏆', 'color': '#E17055'},
        {'id': 7, 'name': '奋进队', 'emoji': '💪', 'color': '#FDCB6E'},
        {'id': 8, 'name': '团结队', 'emoji': '🤝', 'color': '#74B9FF'},
    ],

    # 服务器配置
    'server': {
        'host': '0.0.0.0',
        'port': int(os.environ.get('PORT', 3000)),
        'debug': os.environ.get('DEBUG', 'False').lower() == 'true',
    },
}