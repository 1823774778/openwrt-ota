'use strict';
'require view';
'require fs';
'require ui';
'require poll';

const helper = '/usr/libexec/xwrt-ota';
const repositoryUrl = 'https://github.com/1823774778/XWRT';
const isReadonly = !L.hasViewPermission();
const phases = {
  idle: '尚未检查',
  checking: '检查更新',
  current: '当前为最新版本',
  version_unknown: '无法判断版本',
  available: '发现新版本',
  downloading: '下载中',
  verifying: '校验中',
  ready: '可以升级',
  flashing: '正在刷写',
  error: '任务失败',
};

const runHelper = async function runHelper(args) {
  const result = await fs.exec(helper, args);
  let data;

  try {
    data = JSON.parse(result.stdout || '{}');
  } catch (error) {
    throw new Error('更新服务返回的数据无效，请检查插件是否完整安装。');
  }

  if (result.code !== 0 || data.error) {
    throw new Error(data.error || result.stderr || '更新服务执行失败。');
  }

  return data;
};

const sizeLabel = function sizeLabel(bytes) {
  return bytes ? `${(bytes / 1048576).toFixed(2)} MiB` : '—';
};

return view.extend({
  async load() {
    const data = await runHelper(['status']);
    if (isReadonly || data.busy) return data;

    try {
      await runHelper(['check']);
    } catch (error) {
      const current = await runHelper(['status']);
      if (!current.busy) this.initialError = error;
      return current;
    }

    return runHelper(['status']);
  },

  reportError(error) {
    ui.addNotification(null, E('p', {}, error.message), 'error');
  },

  async refresh() {
    try {
      const data = await runHelper(['status']);
      this.connectionFailed = false;
      this.update(data);
    } catch (error) {
      this.connectionFailed = true;
      this.statusNode.textContent = '无法连接更新服务，正在等待重连…';
      this.actionButton.disabled = true;
      this.cleanButton.disabled = true;
    }
  },

  async start(action) {
    if (isReadonly || this.pendingAction || this.data?.busy) return;
    if (action === 'download' && (this.data?.phase !== 'available' || !this.data.has_update)) return;
    this.pendingAction = action;
    this.updateButtons();

    try {
      await runHelper([action]);
      if (action === 'clean') await runHelper(['check']);
    } catch (error) {
      this.reportError(error);
    } finally {
      await this.refresh();
      this.pendingAction = null;
      this.updateButtons();
    }
  },

  handleAction() {
    if (this.pendingAction || this.data?.busy || isReadonly || this.connectionFailed) return;
    if (this.data?.phase === 'ready' && this.data.download_ready) {
      this.confirmUpgrade();
    } else if (this.data?.phase === 'available' && this.data.has_update) {
      return this.start('download');
    } else if (['idle', 'error'].includes(this.data?.phase)) {
      return this.start('check');
    }
  },

  updateButtons() {
    const data = this.data || {};
    const busy = Boolean(data.busy || this.pendingAction);
    const labels = {
      checking: '检查中…',
      downloading: '下载中…',
      verifying: '校验中…',
      flashing: '安装中…',
    };
    let label = '暂无更新';
    let actionable = false;
    let style = 'btn';

    if (busy) {
      const pendingLabels = { check: '检查中…', clean: '清理中…', download: '下载中…', upgrade: '校验中…' };
      label = labels[data.phase] || pendingLabels[this.pendingAction] || '处理中…';
    } else if (data.phase === 'ready' && data.download_ready) {
      label = '安装更新';
      actionable = true;
      style = 'btn cbi-button-negative';
    } else if (data.phase === 'available' && data.has_update) {
      label = '下载版本';
      actionable = true;
      style = 'btn cbi-button-positive';
    } else if (data.phase === 'version_unknown') {
      label = '无法判断版本';
    } else if (['idle', 'error'].includes(data.phase)) {
      label = '重新检查';
      actionable = true;
      style = 'btn cbi-button-action';
    }

    this.actionButton.textContent = label;
    this.actionButton.className = style;
    this.actionButton.disabled = isReadonly || busy || !actionable || this.connectionFailed;
    this.cleanButton.disabled = isReadonly || busy || this.connectionFailed;
  },

  update(data) {
    this.data = data;
    this.statusNode.textContent = `${phases[data.phase] || data.phase} · ${data.message}`;
    this.statusNode.className = data.phase === 'error' ? 'alert-message danger' : 'alert-message';
    this.fields.model.textContent = data.model || data.board || '未知设备';
    this.fields.current.textContent = data.current_description || [
      data.current_distribution,
      data.current_version,
      data.current_revision,
    ].filter(Boolean).join(' ') || '无法读取';
    this.fields.currentTime.textContent = data.current_build_time || '无法读取完整构建时间';
    this.fields.latestTime.textContent = data.latest_build_time || '等待检查';
    this.fields.latest.textContent = data.name || '正在自动检查…';
    this.fields.tag.textContent = data.tag || '—';
    this.fields.published.textContent = data.published_at
      ? new Date(data.published_at).toLocaleString('zh-CN', { hour12: false })
      : '—';
    this.fields.asset.textContent = data.asset_name || '—';
    this.fields.size.textContent = sizeLabel(data.asset_size);
    this.fields.sha256.textContent = data.sha256 || '—';
    this.notesNode.textContent = data.notes || '检查更新后显示发布说明。';

    const progress = data.asset_size > 0
      ? Math.min(100, Math.floor((data.downloaded / data.asset_size) * 100))
      : 0;
    this.progressNode.value = progress;
    this.progressLabel.textContent = `${progress}% · ${sizeLabel(data.downloaded)} / ${sizeLabel(data.asset_size)}`;
    this.progressWrap.style.display = ['downloading', 'verifying', 'ready', 'flashing'].includes(data.phase)
      ? ''
      : 'none';

    if (data.version_status === 'current') {
      this.versionHint.textContent = '当前为最新版本，暂无更新。';
    } else if (data.download_ready) {
      this.versionHint.textContent = '已下载完成，可更新。切换页面会保留安装包，无需重复下载。';
    } else if (data.version_status === 'update') {
      this.versionHint.textContent = '发现更新的固件构建时间，可下载新版本。';
    } else {
      this.versionHint.textContent = '读取与“状态 → 概览”相同的固件构建时间，精确比较到秒；缺少完整时间时无法自动判断版本。';
    }
    this.updateButtons();

    if (data.phase === 'flashing' && !this.reconnecting) {
      this.reconnecting = true;
      ui.showModal('正在升级', [
        E('p', { class: 'spinning' }, '固件正在刷写，请勿断电。设备重启后将尝试重新连接。'),
      ]);
      ui.awaitReconnect(window.location.host, '192.168.10.1', 'xwrt.lan');
    }
  },

  confirmUpgrade() {
    const data = this.data;
    if (!data || data.phase !== 'ready' || !data.download_ready || data.busy || this.pendingAction || isReadonly) return;

    const keep = E('input', {
      type: 'checkbox',
      checked: data.allow_backup !== false,
      disabled: data.allow_backup === false,
    });
    const acknowledge = E('input', { type: 'checkbox' });
    const submit = E('button', {
      class: 'btn cbi-button-negative important',
      disabled: true,
      click: ui.createHandlerFn(this, async function submitUpgrade() {
        if (!acknowledge.checked || this.pendingAction || this.data?.busy) return;
        submit.disabled = true;
        this.pendingAction = 'upgrade';
        this.updateButtons();

        try {
          await runHelper(['upgrade', keep.checked ? '1' : '0', data.sha256]);
          ui.hideModal();
        } catch (error) {
          ui.hideModal();
          this.reportError(error);
        } finally {
          await this.refresh();
          this.pendingAction = null;
          this.updateButtons();
        }
      }),
    }, '确认升级');

    acknowledge.addEventListener('change', () => {
      submit.disabled = !acknowledge.checked;
    });

    ui.showModal('确认安装此固件？', [
      E('p', {}, data.name),
      E('p', { style: 'overflow-wrap:anywhere' }, data.asset_name),
      E('p', {}, E('label', {}, [keep, ' 保留当前配置（网络、Wi-Fi、登录密码等）'])),
      data.allow_backup === false
        ? E('p', { class: 'alert-message warning' }, '系统校验提示此固件不能保留旧配置，升级后将恢复默认设置。')
        : '',
      E('p', { class: 'alert-message warning' },
        '额外安装的软件包通常不会随系统配置保留。如果新固件未预装本插件，升级后需重新安装本 APK。取消保留配置会恢复固件默认设置。'),
      E('p', {}, E('label', {}, [acknowledge, ' 我已备份重要配置，确认机型和版本，并保证升级期间不断电。'])),
      E('div', { class: 'right' }, [
        E('button', { class: 'btn', click: ui.hideModal }, '取消'),
        ' ',
        submit,
      ]),
    ]);
  },

  render(data) {
    this.fields = {};
    const row = (key, label) => {
      this.fields[key] = E('div', {
        class: 'cbi-value-field',
        style: 'padding-top:6px;overflow-wrap:anywhere',
      });
      return E('div', { class: 'cbi-value' }, [
        E('label', { class: 'cbi-value-title' }, label),
        this.fields[key],
      ]);
    };

    this.statusNode = E('p', { role: 'status', 'aria-live': 'polite' });
    this.versionHint = E('p', { class: 'cbi-section-descr' });
    this.notesNode = E('pre', { style: 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:28rem;overflow:auto' });
    this.progressNode = E('progress', { max: 100, value: 0, style: 'width:100%', 'aria-label': '固件下载进度' });
    this.progressLabel = E('p');
    this.progressWrap = E('div', {}, [this.progressNode, this.progressLabel]);
    this.actionButton = E('button', {
      class: 'btn',
      disabled: true,
      click: ui.createHandlerFn(this, 'handleAction'),
    }, '暂无更新');
    this.cleanButton = E('button', {
      class: 'btn',
      click: ui.createHandlerFn(this, 'start', 'clean'),
    }, '清理缓存');

    const page = E('div', { class: 'cbi-map' }, [
      E('h2', {}, 'XWRT 在线更新'),
      E('div', { class: 'cbi-map-descr' }, [
        '从 ',
        E('a', { href: `${repositoryUrl}/releases/latest`, target: '_blank', rel: 'noopener noreferrer' }, 'XWRT GitHub Releases'),
        ' 获取最新正式版。自动识别雅典娜 / 亚瑟，只下载匹配的 sysupgrade 固件。',
      ]),
      this.statusNode,
      E('div', { class: 'cbi-section' }, [
        row('model', '当前设备'),
        row('current', '当前固件版本'),
        row('currentTime', '当前构建时间'),
        row('latest', '最新发布'),
        row('latestTime', '新版构建时间'),
        row('tag', 'Release 标签'),
        row('published', '发布时间'),
        row('asset', '匹配固件'),
        row('size', '固件大小'),
        row('sha256', 'SHA256'),
      ]),
      this.versionHint,
      this.progressWrap,
      E('div', { class: 'cbi-page-actions', style: 'display:flex;flex-wrap:wrap;gap:8px' }, [
        this.cleanButton,
        this.actionButton,
      ]),
      E('p', {}, [
        E('a', { href: L.url('admin/system/flash') }, '升级前先备份系统配置'),
        '。保留配置不等于保留额外安装的软件包。切换页面会保留已下载固件，主动清理或路由器重启后缓存失效。',
      ]),
      E('div', { class: 'cbi-section' }, [
        E('h3', {}, '发布说明'),
        this.notesNode,
      ]),
    ]);

    this.update(data);
    if (this.initialError) {
      this.reportError(this.initialError);
      this.initialError = null;
    }
    poll.add(() => this.refresh(), 2);
    return page;
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null,
});
