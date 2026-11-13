'use strict';
'require view';
'require fs';
'require ui';
'require poll';

const helper = '/usr/libexec/xwrt-ota';
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

const statusPills = {
  idle: ['尚未检查', 'neutral'],
  checking: ['正在检查', 'neutral'],
  current: ['已是最新', 'success'],
  available: ['有新版本', 'primary'],
  downloading: ['下载中', 'info'],
  verifying: ['校验中', 'info'],
  ready: ['待安装', 'success'],
  flashing: ['刷写中', 'warning'],
  version_unknown: ['无法判断', 'warning'],
  error: ['出错', 'danger'],
};

const progressCopy = {
  downloading: ['正在下载固件', '下载中，请保持设备供电'],
  verifying: ['正在校验固件', '正在核对 SHA256 与设备兼容性'],
  ready: ['固件已就绪', '安装包已通过校验，可以安装'],
  flashing: ['正在写入固件', '请勿断电，设备即将重启'],
};

const styles = `
.xwrt-ota {
  --xwrt-accent: var(--primary-color-high, var(--primary, var(--v-accent-fill, #4f7cff)));
  --xwrt-success: var(--success-color-high, var(--success, var(--v-ok, #16a34a)));
  --xwrt-warning: var(--warning, var(--v-warn, #d97706));
  --xwrt-danger: var(--error-color-high, var(--danger, var(--v-err, #dc2626)));
  --xwrt-muted: rgba(127, 127, 127, 0.9);
  --xwrt-muted: color-mix(in srgb, currentColor 66%, transparent);
  --xwrt-line: rgba(127, 127, 127, 0.28);
  --xwrt-line: color-mix(in srgb, currentColor 18%, transparent);
  --xwrt-panel: rgba(127, 127, 127, 0.08);
  --xwrt-panel: color-mix(in srgb, currentColor 7%, transparent);
}

.xwrt-ota-pill {
  display: inline-block;
  padding: 1px 10px;
  border: 1px solid var(--xwrt-line);
  border-radius: 999px;
  background: var(--xwrt-panel);
  color: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.7;
  white-space: nowrap;
  vertical-align: 1px;
}

.xwrt-ota-pill::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.75;
  vertical-align: 1px;
}

.xwrt-ota-pill-neutral {
  color: var(--xwrt-muted);
}

.xwrt-ota-pill-primary,
.xwrt-ota-pill-info {
  color: var(--xwrt-accent);
  border-color: currentColor;
}

.xwrt-ota-pill-success {
  color: var(--xwrt-success);
  border-color: currentColor;
}

.xwrt-ota-pill-warning {
  color: var(--xwrt-warning);
  border-color: currentColor;
}

.xwrt-ota-pill-danger {
  color: var(--xwrt-danger);
  border-color: currentColor;
}

.xwrt-ota-status {
  color: var(--xwrt-muted);
}

.xwrt-ota-status.is-error {
  color: var(--xwrt-danger);
}

.xwrt-ota .cbi-value-field {
  overflow-wrap: anywhere;
}

.xwrt-ota .cbi-value-description {
  margin-inline-start: 0;
  padding-inline-start: 0;
}

.xwrt-ota .cbi-value-description::before {
  display: none;
}

.xwrt-ota .cbi-value-description:empty {
  display: none;
}

.xwrt-ota-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.xwrt-ota-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--xwrt-muted);
  font-variant-numeric: tabular-nums;
}

.xwrt-ota-progress.is-indeterminate > div {
  width: 100% !important;
  animation: xwrt-ota-pulse 1.5s ease-in-out infinite;
}

@keyframes xwrt-ota-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .xwrt-ota-progress.is-indeterminate > div {
    animation: none;
  }
}
`;

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
    let variant = '';

    if (busy) {
      const pendingLabels = { check: '检查中…', clean: '清理中…', download: '下载中…', upgrade: '校验中…' };
      label = labels[data.phase] || pendingLabels[this.pendingAction] || '处理中…';
    } else if (data.phase === 'ready' && data.download_ready) {
      label = '安装更新';
      actionable = true;
      variant = 'cbi-button-negative important';
    } else if (data.phase === 'available' && data.has_update) {
      label = '下载版本';
      actionable = true;
      variant = 'cbi-button-positive important';
    } else if (data.phase === 'version_unknown') {
      label = '无法判断版本';
    } else if (['idle', 'error'].includes(data.phase)) {
      label = '重新检查';
      actionable = true;
      variant = 'cbi-button-action';
    }

    this.actionButton.textContent = label;
    this.actionButton.className = `btn cbi-button${variant ? ` ${variant}` : ''}`;
    this.actionButton.disabled = isReadonly || busy || !actionable || this.connectionFailed;
    this.cleanButton.disabled = isReadonly || busy || this.connectionFailed;
  },

  update(data) {
    this.data = data;

    const status = statusPills[data.phase] || [phases[data.phase] || data.phase, 'neutral'];
    this.statusPill.textContent = status[0];
    this.statusPill.className = `xwrt-ota-pill xwrt-ota-pill-${status[1]}`;
    this.statusNode.textContent = data.message;
    this.statusNode.className = `xwrt-ota-status${data.phase === 'error' ? ' is-error' : ''}`;

    this.facts.model.textContent = data.model || data.board || '未知设备';
    this.facts.current.textContent = data.current_description || [
      data.current_distribution,
      data.current_version,
      data.current_revision,
    ].filter(Boolean).join(' ') || '无法读取';
    this.facts.latest.textContent = data.name || data.tag || '正在检查…';

    const showProgress = ['downloading', 'verifying', 'ready', 'flashing'].includes(data.phase);
    this.progressWrap.style.display = showProgress ? '' : 'none';

    if (showProgress) {
      const copy = progressCopy[data.phase] || progressCopy.downloading;
      const percent = data.asset_size > 0
        ? Math.min(100, Math.floor((data.downloaded / data.asset_size) * 100))
        : 0;
      const shownPercent = data.phase === 'downloading'
        ? percent
        : (data.phase === 'flashing' ? null : 100);

      this.progressNode.title = shownPercent === null
        ? copy[0]
        : `${copy[0]} · ${shownPercent}%`;
      this.progressState.textContent = copy[1];
      this.progressFill.style.width = `${shownPercent === null ? 100 : shownPercent}%`;
      this.progressBytes.textContent = `${sizeLabel(data.downloaded)} / ${sizeLabel(data.asset_size)}`;
      if (shownPercent === null) this.progressNode.removeAttribute('aria-valuenow');
      else this.progressNode.setAttribute('aria-valuenow', String(shownPercent));
      this.progressNode.classList.toggle('is-indeterminate', data.phase === 'flashing');
    }

    if (data.version_status === 'current') {
      this.versionHint.textContent = '';
    } else if (data.download_ready) {
      this.versionHint.textContent = '安装包已下载并通过校验，可直接安装。';
    } else if (data.version_status === 'update') {
      this.versionHint.textContent = '检测到更新的固件构建，可下载新版本。';
    } else if (data.phase === 'checking' || data.phase === 'idle') {
      this.versionHint.textContent = '正在读取设备与最新发布版本…';
    } else {
      this.versionHint.textContent = '固件缺少完整构建时间，无法自动判断版本。';
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

    const backupAllowed = data.allow_backup !== false;
    const keep = E('input', {
      type: 'checkbox',
      checked: backupAllowed ? '' : null,
      disabled: backupAllowed ? null : '',
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
    this.facts = {};
    const fact = (key, label) => {
      this.facts[key] = E('div', { class: 'cbi-value-field' }, '—');
      return E('div', { class: 'cbi-value' }, [
        E('label', { class: 'cbi-value-title' }, label),
        this.facts[key],
      ]);
    };

    this.statusPill = E('span', { class: 'xwrt-ota-pill xwrt-ota-pill-neutral' }, '尚未检查');
    this.statusNode = E('span', { class: 'xwrt-ota-status', role: 'status', 'aria-live': 'polite' });
    this.versionHint = E('div', { class: 'cbi-value-description' });

    this.progressFill = E('div', { style: 'width:0%' });
    this.progressBytes = E('span', {}, '—');
    this.progressState = E('span', {}, '');
    this.progressNode = E('div', {
      class: 'xwrt-ota-progress cbi-progressbar',
      title: '',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '0',
      'aria-label': '固件下载进度',
    }, [this.progressFill]);
    this.progressWrap = E('fieldset', { class: 'cbi-section', style: 'display:none' }, [
      E('h3', {}, '固件下载'),
      E('div', { class: 'cbi-section-node' }, [
        this.progressNode,
        E('div', { class: 'xwrt-ota-progress-meta' }, [this.progressBytes, this.progressState]),
      ]),
    ]);

    this.actionButton = E('button', {
      type: 'button',
      class: 'btn cbi-button',
      disabled: true,
      click: ui.createHandlerFn(this, 'handleAction'),
    }, '暂无更新');
    this.cleanButton = E('button', {
      type: 'button',
      class: 'btn cbi-button',
      click: ui.createHandlerFn(this, 'start', 'clean'),
    }, '清理缓存');

    const page = E('div', { class: 'cbi-map xwrt-ota' }, [
      E('style', {}, styles),
      E('h2', {}, 'XWRT 在线更新'),
      E('div', { class: 'cbi-map-descr' }, '自动匹配当前设备的XWRT正式版固件'),
      E('fieldset', { class: 'cbi-section' }, [
        E('h3', {}, '设备与版本'),
        E('div', { class: 'cbi-section-node' }, [
          fact('model', '当前设备'),
          fact('current', '当前固件版本'),
          fact('latest', '最新版本'),
          E('div', { class: 'cbi-value' }, [
            E('label', { class: 'cbi-value-title' }, '状态'),
            E('div', { class: 'cbi-value-field' }, [
              this.statusPill,
              ' ',
              this.statusNode,
              this.versionHint,
            ]),
          ]),
        ]),
      ]),
      this.progressWrap,
      E('fieldset', { class: 'cbi-section' }, [
        E('h3', {}, '操作'),
        E('div', { class: 'cbi-section-node' }, [
          E('div', { class: 'xwrt-ota-actions' }, [
            this.actionButton,
            this.cleanButton,
          ]),
        ]),
      ]),
      E('div', { class: 'cbi-map-descr' }, [
        '升级前请先',
        E('a', { href: L.url('admin/system/flash') }, '备份系统配置'),
        '。切换页面会保留已下载固件，主动清理或路由器重启后缓存失效。',
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
