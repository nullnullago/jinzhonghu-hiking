/* ============================================================
   金钟湖健步行 - 前端交互逻辑
   ============================================================ */

(function () {
  'use strict';

  // ========== 工具函数 ==========
  const $ = (sel, parent) => (parent || document).querySelector(sel);
  const $$ = (sel, parent) => Array.from((parent || document).querySelectorAll(sel));

  function showToast(msg, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `${icons[type] || ''} ${msg}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 2500);
    setTimeout(() => toast.remove(), 2800);
  }

  async function api(url, options = {}) {
    const defaultOptions = {
      headers: { 'Content-Type': 'application/json' },
    };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      options.body = JSON.stringify(options.body);
    }
    try {
      const res = await fetch(url, { ...defaultOptions, ...options });
      const data = await res.json();
      return data;
    } catch (e) {
      return { success: false, message: '网络错误，请检查连接' };
    }
  }

  // ========== 导航栏移动端切换 ==========
  const menuToggle = $('#menuToggle');
  const navLinks = $('.nav-links');
  if (menuToggle && navLinks) {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);

    function openMenu() {
      navLinks.classList.add('open');
      overlay.classList.add('open');
    }

    function closeMenu() {
      navLinks.classList.remove('open');
      overlay.classList.remove('open');
    }

    menuToggle.addEventListener('click', () => {
      navLinks.classList.contains('open') ? closeMenu() : openMenu();
    });

    overlay.addEventListener('click', closeMenu);

    // 点击任意菜单项关闭
    $$('.nav-link', navLinks).forEach(link => {
      link.addEventListener('click', closeMenu);
    });
  }

  // ========== 实时时钟（打卡页面） ==========
  const clockEl = $('#checkinClock');
  if (clockEl) {
    function updateClock() {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // ========== 报名 ==========
  const registerForm = $('#registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#registerBtn');
      btn.disabled = true;
      btn.innerHTML = '提交中...';

      const name = $('#regName').value.trim();
      const phone = $('#regPhone').value.trim();
      const teamRadio = $('input[name="team"]:checked');
      const teamId = teamRadio ? parseInt(teamRadio.value) : null;

      const result = await api('/api/register', {
        method: 'POST',
        body: { name, phone, team_id: teamId },
      });

      const resultDiv = $('#registerResult');
      resultDiv.style.display = 'block';

      if (result.success) {
        resultDiv.className = 'result-card success';
        resultDiv.innerHTML = `
          <h3>🎉 报名成功！</h3>
          <p>您的参赛编号是：<strong style="font-size:1.4em;color:var(--primary)">${result.data.bib_number}</strong></p>
          <p style="color:var(--text-light);margin-top:4px">请妥善保管此编号，用于后续打卡和成绩查询</p>
          <div class="user-info">
            <div class="info-item"><div class="label">姓名</div><div class="value">${result.data.name}</div></div>
            <div class="info-item"><div class="label">队伍</div><div class="value">${result.data.team_emoji} ${result.data.team_name}</div></div>
          </div>
        `;
        registerForm.style.display = 'none';
        showToast('报名成功！参赛编号：' + result.data.bib_number, 'success');
      } else {
        resultDiv.className = 'result-card error';
        resultDiv.innerHTML = `<p>❌ ${result.message}</p>`;
        showToast(result.message, 'error');
      }

      btn.disabled = false;
      btn.innerHTML = '确认报名 <i class="fas fa-check"></i>';
    });
  }

  // ========== 打卡 ==========
  const checkinBtn = $('#checkinBtn');
  if (checkinBtn) {
    // GPS 定位
    let gpsLocation = null;

    function updateGpsStatus(status, text) {
      const el = $('#gpsStatus');
      if (el) {
        el.className = 'gps-status ' + status;
        $('#gpsText').textContent = text;
      }
    }

    function getLocation() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          updateGpsStatus('gps-error', '设备不支持定位');
          resolve(null);
          return;
        }
        updateGpsStatus('gps-pending', '正在获取定位...');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            gpsLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            updateGpsStatus('gps-success', `定位成功 (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
            resolve(gpsLocation);
          },
          (err) => {
            updateGpsStatus('gps-error', '定位失败，将跳过位置记录');
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );
        // 超时兜底
        setTimeout(() => {
          if (!gpsLocation && $('#gpsStatus')?.className.includes('gps-pending')) {
            updateGpsStatus('gps-error', '定位超时，将跳过位置记录');
            resolve(null);
          }
        }, 9000);
      });
    }

    // 页面加载时自动获取定位
    getLocation();

    checkinBtn.addEventListener('click', async () => {
      const phone = $('#checkinPhone').value.trim();
      if (!phone) { showToast('请输入手机号', 'error'); return; }
      if (phone.length !== 11 || !/^\d+$/.test(phone)) {
        showToast('请输入正确的11位手机号', 'error');
        return;
      }

      const type = checkinBtn.dataset.type;
      const btnText = checkinBtn.innerHTML;
      checkinBtn.disabled = true;
      checkinBtn.innerHTML = '打卡中...';

      const endpoint = type === 'start' ? '/api/checkin/start' : '/api/checkin/end';
      const body = { phone: phone };
      if (gpsLocation) {
        body.lat = gpsLocation.lat;
        body.lng = gpsLocation.lng;
      }

      const result = await api(endpoint, { method: 'POST', body });

      const resultDiv = $('#checkinResult');
      resultDiv.style.display = 'block';

      if (result.success) {
        const u = result.user;
        resultDiv.className = 'result-card success';
        let timeInfo = '';
        if (type === 'start') {
          timeInfo = `<div class="info-item"><div class="label">出发时间</div><div class="value">${u.start_time}</div></div>`;
        } else {
          const dur = u.duration;
          const min = Math.floor(dur / 60);
          const sec = dur % 60;
          timeInfo = `
            <div class="info-item"><div class="label">出发时间</div><div class="value">${u.start_time}</div></div>
            <div class="info-item"><div class="label">到达时间</div><div class="value">${u.end_time}</div></div>
            <div class="info-item"><div class="label">用时</div><div class="value">${min}分${sec}秒</div></div>
          `;
        }
        resultDiv.innerHTML = `
          <h3>${type === 'start' ? '🚩' : '🏁'} ${result.message}</h3>
          <div class="user-info">
            <div class="info-item"><div class="label">参赛编号</div><div class="value">${u.bib_number}</div></div>
            <div class="info-item"><div class="label">队伍</div><div class="value">${u.team_emoji} ${u.team_name}</div></div>
            ${timeInfo}
          </div>
        `;
        showToast(result.message, 'success');
      } else {
        resultDiv.className = 'result-card error';
        resultDiv.innerHTML = `<p>❌ ${result.message}</p>`;
        showToast(result.message, 'error');
      }

      checkinBtn.disabled = false;
      checkinBtn.innerHTML = btnText;
    });
  }

  // ========== 成绩查询 ==========
  const queryBtn = $('#queryBtn');
  if (queryBtn) {
    queryBtn.addEventListener('click', async () => {
      const bib = $('#queryBib').value.trim().toUpperCase();
      if (!bib) { showToast('请输入参赛编号', 'error'); return; }

      queryBtn.disabled = true;
      const result = await api(`/api/user/${bib}`);

      const resultDiv = $('#queryResult');
      resultDiv.style.display = 'block';

      if (result.success) {
        const u = result.user;
        resultDiv.className = 'result-card success';
        const dur = u.duration;
        let durText = '-';
        if (dur) { const m = Math.floor(dur / 60); const s = dur % 60; durText = `${m}分${s}秒`; }
        resultDiv.innerHTML = `
          <h3>📋 成绩详情</h3>
          <div class="user-info">
            <div class="info-item"><div class="label">参赛编号</div><div class="value">${u.bib_number}</div></div>
            <div class="info-item"><div class="label">姓名</div><div class="value">${u.name}</div></div>
            <div class="info-item"><div class="label">队伍</div><div class="value">${u.team_emoji} ${u.team_name}</div></div>
            <div class="info-item"><div class="label">起点打卡</div><div class="value">${u.start_time || '未打卡'}</div></div>
            <div class="info-item"><div class="label">终点打卡</div><div class="value">${u.end_time || '未打卡'}</div></div>
            <div class="info-item"><div class="label">用时</div><div class="value">${durText}</div></div>
          </div>
        `;
      } else {
        resultDiv.className = 'result-card error';
        resultDiv.innerHTML = `<p>❌ ${result.message}</p>`;
        showToast(result.message, 'error');
      }
      queryBtn.disabled = false;
    });
  }

  // ========== 队伍排行 ==========
  const rankingsList = $('#rankingsList');
  if (rankingsList) {
    (async function loadRankings() {
      const result = await api('/api/rankings');
      if (!result.success) { rankingsList.innerHTML = '<p class="text-center text-muted">加载失败</p>'; return; }

      const posClasses = ['gold', 'silver', 'bronze'];
      rankingsList.innerHTML = result.rankings.map((r, i) => {
        const posClass = i < 3 ? posClasses[i] : 'normal';
        let avgText = r.avg_duration ? (() => { const m = Math.floor(r.avg_duration / 60); const s = r.avg_duration % 60; return `${m}分${s}秒`; })() : '暂无数据';
        return `
          <div class="ranking-item">
            <div class="ranking-pos ${posClass}">${i + 1}</div>
            <div class="ranking-team">
              <div class="ranking-team-name">${r.emoji} ${r.name}</div>
              <div class="ranking-team-stats">${r.total_members}人报名 / ${r.finished}人完成</div>
            </div>
            <div class="ranking-time">
              <div class="time-val">${avgText}</div>
              <div class="time-label">平均用时</div>
            </div>
          </div>
        `;
      }).join('');
    })();
  }

  // ========== 管理后台登录 ==========
  const adminLoginForm = $('#adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = $('#adminPassword').value;
      const result = await api('/api/admin/login', { method: 'POST', body: { password } });
      if (result.success) {
        window.location.href = '/admin';
      } else {
        const errEl = $('#adminLoginError');
        errEl.style.display = 'block';
        errEl.textContent = result.message;
      }
    });
  }

  // ========== 管理后台面板 ==========
  const adminDashboard = $('.admin-dashboard');
  if (adminDashboard) {
    // Tab 切换
    $$('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.admin-tab').forEach(t => t.classList.remove('active'));
        $$('.admin-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        $(`#tab-${tab.dataset.tab}`).classList.add('active');
      });
    });

    // 退出登录
    $('#adminLogoutBtn')?.addEventListener('click', async () => {
      await api('/api/admin/logout', { method: 'POST' });
      window.location.href = '/admin/login';
    });

    // 加载统计数据
    (async function loadStats() {
      const result = await api('/api/admin/stats?password=zhongshan2026');
      if (!result.success) return;
      const s = result.stats;
      $('#statTotal').textContent = s.total;
      $('#statStarted').textContent = s.started;
      $('#statFinished').textContent = s.finished;
      $('#statRate').textContent = s.total > 0 ? Math.round(s.finished / s.total * 100) + '%' : '0%';

      // 各队统计
      const usersResult = await api('/api/admin/users?password=zhongshan2026');
      if (!usersResult.success) return;
      const users = usersResult.users;

      // 从页面获取队伍配置
      const teamMap = {};
      document.querySelectorAll('.team-option, .team-card').forEach(el => {}); // no-op, use config from server

      // 用 fetch 获取队伍数据
      const teamsResult = await api('/api/teams');
      if (teamsResult.success) {
        const teamStats = teamsResult.teams.map(t => {
          const teamUsers = users.filter(u => u.team_id === t.id);
          const started = teamUsers.filter(u => u.start_time).length;
          const finished = teamUsers.filter(u => u.end_time).length;
          const durations = teamUsers.filter(u => u.duration).map(u => u.duration);
          const avgDur = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
          let avgText = '-';
          if (avgDur) { const m = Math.floor(avgDur / 60); const s = avgDur % 60; avgText = `${m}分${s}秒`; }
          return { ...t, member_count: teamUsers.length, started, finished, avgText };
        });
        const tbody = $('#teamStatsBody');
        if (tbody) {
          tbody.innerHTML = teamStats.map(ts => `
            <tr>
              <td><span class="team-cell">${ts.emoji} ${ts.name}</span></td>
              <td>${ts.member_count}</td>
              <td>${ts.started}</td>
              <td>${ts.finished}</td>
              <td>${ts.avgText}</td>
            </tr>
          `).join('');
        }
      }
    })();

    // 加载用户列表
    (async function loadUsers() {
      const result = await api('/api/admin/users?password=zhongshan2026');
      if (!result.success) return;
      renderUsersTable(result.users);
    })();

    function renderUsersTable(users) {
      const tbody = $('#usersTableBody');
      if (!tbody) return;
      tbody.innerHTML = users.map(u => {
        let durText = '-';
        if (u.duration) { const m = Math.floor(u.duration / 60); const s = u.duration % 60; durText = `${m}分${s}秒`; }
        return `
          <tr>
            <td><strong>${u.bib_number}</strong></td>
            <td>${u.name}</td>
            <td>${u.phone}</td>
            <td>${u.team_name}</td>
            <td>${u.start_time || '-'}</td>
            <td>${u.end_time || '-'}</td>
            <td>${durText}</td>
          </tr>
        `;
      }).join('');
    }

    // 用户搜索
    const userSearch = $('#userSearchInput');
    if (userSearch) {
      let allUsers = [];
      (async function () {
        const result = await api('/api/admin/users?password=zhongshan2026');
        allUsers = result.success ? result.users : [];
      })();

      userSearch.addEventListener('input', () => {
        const q = userSearch.value.toLowerCase();
        const filtered = allUsers.filter(u =>
          u.name.includes(q) || u.bib_number.toLowerCase().includes(q) || u.phone.includes(q)
        );
        renderUsersTable(filtered);
      });
    }

    // 二维码生成
    $('#genStartQR')?.addEventListener('click', () => generateQR('start'));
    $('#genEndQR')?.addEventListener('click', () => generateQR('end'));

    async function generateQR(type) {
      const url = $('#qrcodeUrl').value.trim();
      const params = url ? `?url=${encodeURIComponent(url)}` : '';
      const sep = params ? '&' : '?';
      const qrUrl = `/api/admin/qrcode/${type}${params}${sep}password=zhongshan2026`;
      const preview = $('#qrcodePreview');
      preview.innerHTML = `<img src="${qrUrl}" alt="${type === 'start' ? '起点' : '终点'}打卡二维码" onerror="this.parentElement.innerHTML='<p style=color:red>二维码生成失败</p>'">`;
    }

    // CSV 导出
    $('#exportBtn')?.addEventListener('click', () => {
      window.location.href = '/api/admin/export?password=zhongshan2026';
    });

    // 活动设置
    const settingsForm = $('#settingsForm');
    if (settingsForm) {
      // 加载当前设置
      fetch('/api/admin/settings?password=zhongshan2026')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            const c = data.config;
            $('#settingName').value = c.name || '';
            $('#settingDate').value = c.date || '';
            $('#settingLocation').value = c.location || '';
            $('#settingDistance').value = c.distance || '';
            $('#settingDescription').value = c.description || '';
          }
        })
        .catch(err => console.error('加载设置失败:', err));

      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('#settingsSaveBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';

        const data = {
          name: $('#settingName').value.trim(),
          date: $('#settingDate').value.trim(),
          location: $('#settingLocation').value.trim(),
          distance: $('#settingDistance').value.trim(),
          description: $('#settingDescription').value.trim(),
        };

        try {
          const res = await fetch('/api/admin/settings?password=zhongshan2026', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          const result = await res.json();
          const msg = $('#settingsMsg');
          msg.textContent = result.message || (result.success ? '设置保存成功' : '保存失败');
          msg.className = result.success ? 'settings-msg success' : 'settings-msg error';
          msg.style.display = 'block';
          setTimeout(() => msg.style.display = 'none', 3000);
        } catch (err) {
          console.error('保存设置失败:', err);
          const msg = $('#settingsMsg');
          msg.textContent = '网络错误，请重试';
          msg.className = 'settings-msg error';
          msg.style.display = 'block';
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      });
    }

    // ========== 批量导入 ==========
    const importModal = $('#importModal');
    const importBtn = $('#importBtn');
    const importModalClose = $('#importModalClose');
    const importCancelBtn = $('#importCancelBtn');
    const importSubmitBtn = $('#importSubmitBtn');
    const csvFileInput = $('#csvFile');
    const jsonFileInput = $('#jsonFile');
    let selectedFile = null;
    let importType = 'csv';

    // 打开/关闭模态框
    importBtn?.addEventListener('click', () => { importModal.style.display = 'flex'; });
    function closeImportModal() { importModal.style.display = 'none'; selectedFile = null; csvFileInput.value = ''; jsonFileInput.value = ''; importSubmitBtn.disabled = true; }
    importModalClose?.addEventListener('click', closeImportModal);
    importCancelBtn?.addEventListener('click', closeImportModal);
    importModal?.addEventListener('click', (e) => { if (e.target === importModal) closeImportModal(); });

    // 切换导入类型
    $$('.import-option').forEach(opt => {
      opt.addEventListener('click', () => {
        $$('.import-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        importType = opt.dataset.type;
        $('#importFormCSV').style.display = importType === 'csv' ? 'block' : 'none';
        $('#importFormJSON').style.display = importType === 'json' ? 'block' : 'none';
        selectedFile = null;
        csvFileInput.value = '';
        jsonFileInput.value = '';
        importSubmitBtn.disabled = true;
      });
    });

    // 文件选择
    csvFileInput?.addEventListener('change', (e) => { selectedFile = e.target.files[0]; importSubmitBtn.disabled = !selectedFile; });
    jsonFileInput?.addEventListener('change', (e) => { selectedFile = e.target.files[0]; importSubmitBtn.disabled = !selectedFile; });

    // 提交导入
    importSubmitBtn?.addEventListener('click', async () => {
      if (!selectedFile) return;
      importSubmitBtn.disabled = true;
      importSubmitBtn.innerHTML = '导入中...';

      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        const res = await fetch('/api/admin/users/import?password=zhongshan2026', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();

        if (data.success) {
          const r = data.results;
          showToast(`导入完成：成功 ${r.success} 条，失败 ${r.failed} 条`, r.failed > 0 ? 'error' : 'success');
          if (r.errors && r.errors.length > 0) {
            alert('导入结果：\n成功 ' + r.success + ' 条\n失败 ' + r.failed + ' 条\n\n错误详情：\n' + r.errors.join('\n'));
          }
          closeImportModal();
          // 刷新用户列表
          const usersResult = await api('/api/admin/users?password=zhongshan2026');
          if (usersResult.success) {
            allUsers = usersResult.users;
            renderUsersTable(allUsers);
          }
        } else {
          showToast(data.message || '导入失败', 'error');
        }
      } catch (e) {
        showToast('网络错误，请重试', 'error');
      }

      importSubmitBtn.disabled = false;
      importSubmitBtn.innerHTML = '开始导入';
    });

    // ========== 队伍管理 ==========
    (function initTeamManagement() {
      const teamModal = $('#teamModal');
      const teamModalTitle = $('#teamModalTitle');
      const teamForm = $('#teamForm');
      const teamIdInput = $('#teamId');
      const teamNameInput = $('#teamName');
      const teamEmojiInput = $('#teamEmoji');
      const teamColorInput = $('#teamColor');
      const teamColorValue = $('#teamColorValue');
      const teamSubmitBtn = $('#teamSubmitBtn');
      const teamsTableBody = $('#teamsTableBody');

      let allTeams = [];

      // 颜色选择器更新
      teamColorInput?.addEventListener('input', () => {
        teamColorValue.textContent = teamColorInput.value.toUpperCase();
      });

      // 打开新增队伍模态框
      $('#addTeamBtn')?.addEventListener('click', () => {
        teamModalTitle.textContent = '新增队伍';
        teamIdInput.value = '';
        teamNameInput.value = '';
        teamEmojiInput.value = '';
        teamColorInput.value = '#D5001C';
        teamColorValue.textContent = '#D5001C';
        teamModal.style.display = 'flex';
        teamNameInput.focus();
      });

      // 关闭模态框
      function closeTeamModal() {
        teamModal.style.display = 'none';
      }
      $('#teamModalClose')?.addEventListener('click', closeTeamModal);
      $('#teamCancelBtn')?.addEventListener('click', closeTeamModal);
      teamModal?.addEventListener('click', (e) => { if (e.target === teamModal) closeTeamModal(); });

      // 提交队伍表单
      teamSubmitBtn?.addEventListener('click', async () => {
        const name = teamNameInput.value.trim();
        if (!name) { showToast('请输入队伍名称', 'error'); return; }

        const teamId = teamIdInput.value;
        const emoji = teamEmojiInput.value.trim();
        const color = teamColorInput.value;

        const isEdit = !!teamId;
        const url = isEdit
          ? `/api/admin/teams/${teamId}?password=zhongshan2026`
          : `/api/admin/teams?password=zhongshan2026`;
        const method = isEdit ? 'PUT' : 'POST';

        const result = await api(url, { method, body: { name, emoji, color } });

        if (result.success) {
          showToast(result.message, 'success');
          closeTeamModal();
          await loadTeams();
        } else {
          showToast(result.message, 'error');
        }
      });

      // 编辑队伍
      window.editTeam = function (teamId) {
        const team = allTeams.find(t => t.id == teamId);
        if (!team) return;
        teamModalTitle.textContent = '编辑队伍';
        teamIdInput.value = team.id;
        teamNameInput.value = team.name;
        teamEmojiInput.value = team.emoji || '';
        teamColorInput.value = team.color || '#333';
        teamColorValue.textContent = (team.color || '#333').toUpperCase();
        teamModal.style.display = 'flex';
        teamNameInput.focus();
      };

      // 删除队伍
      window.deleteTeam = async function (teamId) {
        const team = allTeams.find(t => t.id == teamId);
        if (!team) return;

        if (team.member_count > 0) {
          showToast(`队伍「${team.name}」还有 ${team.member_count} 名成员，无法删除`, 'error');
          return;
        }

        if (!confirm(`确定删除队伍「${team.name}」吗？此操作不可恢复。`)) return;

        const result = await api(`/api/admin/teams/${teamId}?password=zhongshan2026`, { method: 'DELETE' });

        if (result.success) {
          showToast(result.message, 'success');
          await loadTeams();
        } else {
          showToast(result.message, 'error');
        }
      };

      // 加载队伍列表
      async function loadTeams() {
        if (!teamsTableBody) return;
        teamsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">加载中...</td></tr>';

        const result = await api('/api/admin/teams?password=zhongshan2026');
        if (!result.success) {
          teamsTableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:var(--unicom-red)">加载失败</td></tr>';
          return;
        }

        allTeams = result.teams;
        teamsTableBody.innerHTML = allTeams.map(t => `
          <tr>
            <td><code>${t.id}</code></td>
            <td>
              <span class="team-cell">
                <span class="team-emoji">${t.emoji || ''}</span>
                <strong>${t.name}</strong>
              </span>
            </td>
            <td>${t.member_count}</td>
            <td>
              <span class="color-swatch" style="background:${t.color}" title="${t.color}"></span>
              ${t.color}
            </td>
            <td>
              <div class="table-actions">
                <button class="btn btn-xs btn-outline" onclick="editTeam(${t.id})">
                  <i class="fas fa-edit"></i> 编辑
                </button>
                <button class="btn btn-xs btn-danger" onclick="deleteTeam(${t.id})">
                  <i class="fas fa-trash"></i> 删除
                </button>
              </div>
            </td>
          </tr>
        `).join('');
      }

      // Tab 切换到队伍管理时加载数据
      const teamsTab = $('.admin-tab[data-tab="teams"]');
      if (teamsTab) {
        teamsTab.addEventListener('click', () => loadTeams());
        // 如果已经是默认加载的 tab 则初始加载
        if (teamsTab.classList.contains('active')) loadTeams();
      }
    })();
  }

})();