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
  --xwrt-primary: var(--v-accent-fill, var(--primary, #5e72e4));
  --xwrt-primary-2: var(--v-accent-fill-hover, var(--info, #11cdef));
  --xwrt-accent-text: var(--v-accent-text, var(--primary, #5e72e4));
  --xwrt-success: var(--v-ok, var(--success, #2dce89));
  --xwrt-warning: var(--v-warn, var(--warning, #fb6340));
  --xwrt-danger: var(--v-err, var(--danger, #f5365c));
  --xwrt-surface: var(--v-surface, var(--surface-color, #fff));
  --xwrt-panel: var(--v-surface-3, var(--surface-muted, #f6f9fc));
  --xwrt-line: var(--v-line, var(--border-muted, #e9ecef));
  --xwrt-text: var(--v-text, var(--text-strong, #32325d));
  --xwrt-muted: var(--v-text-2, var(--muted-text, #626f80));
  --xwrt-radius: var(--v-r-lg, var(--radius-card, 0.75rem));
  --xwrt-shadow: var(--v-shadow, var(--section-shadow, 0 0 1rem rgba(136, 152, 170, 0.15)));
  --xwrt-ring: var(--v-accent-soft, var(--accent-shadow-color, rgba(94, 114, 228, 0.18)));
  --xwrt-hero-ink: var(--v-accent-fill-ink, #fff);
  --xwrt-hero-a: var(--v-accent-fill, var(--primary, #5e72e4));
  --xwrt-hero-b: var(--v-accent-fill-hover, var(--info, #11cdef));
  --xwrt-hero-glow: rgba(255, 255, 255, 0.24);
  --xwrt-pill-bg: rgba(255, 255, 255, 0.3);
  --xwrt-pill-line: rgba(255, 255, 255, 0.45);
  --xwrt-pill-ink: var(--xwrt-hero-ink);
  --xwrt-track: var(--v-surface-3, var(--progress-bg, #e9ecef));
  --xwrt-done-b: var(--v-info, var(--xwrt-primary-2));
  display: flex;
  flex-direction: column;
  gap: var(--v-sp-4, 18px);
  color: var(--xwrt-text);
}

html[data-darkmode="true"] .xwrt-ota {
  --xwrt-hero-a: var(--v-surface-2, #1b1d21);
  --xwrt-hero-b: var(--v-surface-3, #22252a);
  --xwrt-hero-glow: var(--v-accent-soft, rgba(200, 240, 49, 0.1));
  --xwrt-hero-ink: var(--v-text, #e8eaed);
  --xwrt-pill-bg: var(--v-accent-soft, rgba(200, 240, 49, 0.1));
  --xwrt-pill-line: var(--v-accent-line, rgba(200, 240, 49, 0.5));
  --xwrt-pill-ink: var(--v-accent-text, #c8f031);
  --xwrt-ring: rgba(0, 0, 0, 0.45);
}

.xwrt-ota-hero {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 22px 24px;
  border-radius: var(--xwrt-radius);
  color: var(--xwrt-hero-ink);
  background:
    radial-gradient(130% 160% at 100% 0%, var(--xwrt-hero-glow) 0%, transparent 58%),
    linear-gradient(135deg, var(--xwrt-hero-a) 0%, var(--xwrt-hero-b) 135%);
  box-shadow: 0 14px 30px -14px var(--xwrt-ring);
}

.xwrt-ota-hero-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.xwrt-ota-hero-title {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  font-size: 20px;
  line-height: 1.3;
  color: var(--xwrt-hero-ink);
}

.xwrt-ota-hero-sub {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--xwrt-hero-ink);
  opacity: 0.78;
}

.xwrt-ota-pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 7px 14px;
  border-radius: var(--radius-pill, 999px);
  border: 1px solid var(--xwrt-pill-line);
  background: var(--xwrt-pill-bg);
  color: var(--xwrt-pill-ink);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.xwrt-ota-pill::before {
  content: '';
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.75;
}

.xwrt-ota-status {
  margin: 0;
  padding: 0.75rem var(--v-card-px, var(--section-inset, 1.25rem));
  border-radius: var(--v-r, var(--radius-control, 0.375rem));
  background: var(--xwrt-panel);
  color: var(--xwrt-muted);
  font-size: 13.5px;
}

.xwrt-ota-status.is-error {
  background: rgba(245, 54, 92, 0.08);
  color: var(--xwrt-danger);
}

.xwrt-ota-facts {
  display: flex;
  flex-direction: column;
  padding: 4px var(--v-card-px, var(--section-inset, 1.25rem));
  border: 1px solid var(--v-line, transparent);
  border-radius: var(--xwrt-radius);
  background: var(--xwrt-surface);
  box-shadow: var(--xwrt-shadow);
}

.xwrt-ota-fact {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  min-width: 0;
  padding: 14px 0;
  border-bottom: 1px solid var(--xwrt-line);
}

.xwrt-ota-fact:last-child {
  border-bottom: 0;
}

.xwrt-ota-fact-label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--xwrt-muted);
}

.xwrt-ota-fact-value {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--xwrt-text);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.xwrt-ota-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--xwrt-muted);
}

.xwrt-ota-progress-card {
  padding: var(--v-card-py, var(--field-gap, 1rem)) var(--v-card-px, var(--section-inset, 1.25rem));
  border: 1px solid var(--v-line, transparent);
  border-radius: var(--xwrt-radius);
  background: var(--xwrt-surface);
  box-shadow: var(--xwrt-shadow);
}

.xwrt-ota-progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.xwrt-ota-progress-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--xwrt-text);
}

.xwrt-ota-progress-percent {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--xwrt-accent-text);
}

.xwrt-ota-progress-track {
  position: relative;
  height: 14px;
  border-radius: var(--radius-pill, 999px);
  background: var(--xwrt-track);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.xwrt-ota-progress-fill {
  position: relative;
  height: 100%;
  width: 0;
  border-radius: inherit;
  background-image: linear-gradient(90deg, var(--xwrt-primary), var(--xwrt-primary-2));
  background-size: 220% 100%;
  transition: width 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.xwrt-ota-progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    115deg,
    rgba(255, 255, 255, 0.28) 0 12px,
    rgba(255, 255, 255, 0) 12px 24px
  );
  opacity: 0;
}

.xwrt-ota-progress.is-active .xwrt-ota-progress-fill {
  animation: xwrt-ota-flow 2.4s linear infinite;
}

.xwrt-ota-progress.is-active .xwrt-ota-progress-fill::after {
  opacity: 1;
  animation: xwrt-ota-stripes 1s linear infinite;
}

.xwrt-ota-progress.is-complete .xwrt-ota-progress-fill {
  background-image: linear-gradient(90deg, var(--xwrt-success), var(--xwrt-done-b));
  animation: none;
}

.xwrt-ota-progress.is-complete .xwrt-ota-progress-fill::after {
  opacity: 0;
}

.xwrt-ota-progress.is-indeterminate .xwrt-ota-progress-fill {
  width: 38% !important;
  animation: xwrt-ota-indeterminate 1.5s ease-in-out infinite;
}

.xwrt-ota-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 9px;
  font-size: 12.5px;
  color: var(--xwrt-muted);
  font-variant-numeric: tabular-nums;
}

.xwrt-ota-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.xwrt-ota-note {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--xwrt-muted);
}

.xwrt-ota-note a {
  color: var(--v-accent-text, var(--link-color, var(--xwrt-primary)));
}

@keyframes xwrt-ota-flow {
  from { background-position: 0% 0; }
  to { background-position: 220% 0; }
}

@keyframes xwrt-ota-stripes {
  from { background-position: 0 0; }
  to { background-position: 24px 0; }
}

@keyframes xwrt-ota-indeterminate {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(320%); }
}

@media (max-width: 720px) {
  .xwrt-ota-hero {
    padding: 18px;
  }
}

@media (max-width: 560px) {
  .xwrt-ota-facts {
    padding: 2px 14px;
  }

  .xwrt-ota-fact {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 12px 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .xwrt-ota-progress.is-active .xwrt-ota-progress-fill,
  .xwrt-ota-progress.is-active .xwrt-ota-progress-fill::after,
  .xwrt-ota-progress.is-indeterminate .xwrt-ota-progress-fill {
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

      this.progressTitle.textContent = copy[0];
      this.progressState.textContent = copy[1];
      this.progressPercent.textContent = shownPercent === null || data.asset_size <= 0
        ? '—'
        : `${shownPercent}%`;
      this.progressFill.style.width = `${shownPercent === null ? 100 : shownPercent}%`;
      this.progressBytes.textContent = `${sizeLabel(data.downloaded)} / ${sizeLabel(data.asset_size)}`;
      if (shownPercent === null) this.progressNode.removeAttribute('aria-valuenow');
      else this.progressNode.setAttribute('aria-valuenow', String(shownPercent));
      this.progressNode.classList.toggle('is-active', ['downloading', 'verifying'].includes(data.phase));
      this.progressNode.classList.toggle('is-complete', data.phase === 'ready');
      this.progressNode.classList.toggle('is-indeterminate', data.phase === 'flashing');
    }

    if (data.version_status === 'current') {
      this.versionHint.textContent = '已安装最新正式版固件。';
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
      this.facts[key] = E('div', { class: 'xwrt-ota-fact-value' }, '—');
      return E('div', { class: 'xwrt-ota-fact' }, [
        E('div', { class: 'xwrt-ota-fact-label' }, label),
        this.facts[key],
      ]);
    };

    this.statusPill = E('span', { class: 'xwrt-ota-pill xwrt-ota-pill-neutral' }, '尚未检查');
    this.statusNode = E('p', { class: 'xwrt-ota-status', role: 'status', 'aria-live': 'polite' });
    this.versionHint = E('p', { class: 'xwrt-ota-hint' });

    this.progressTitle = E('span', { class: 'xwrt-ota-progress-title' }, '正在下载固件');
    this.progressPercent = E('span', { class: 'xwrt-ota-progress-percent' }, '0%');
    this.progressFill = E('div', { class: 'xwrt-ota-progress-fill' });
    this.progressBytes = E('span', {}, '—');
    this.progressState = E('span', {}, '');
    this.progressNode = E('div', {
      class: 'xwrt-ota-progress',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '0',
      'aria-label': '固件下载进度',
    }, [
      E('div', { class: 'xwrt-ota-progress-head' }, [this.progressTitle, this.progressPercent]),
      E('div', { class: 'xwrt-ota-progress-track' }, [this.progressFill]),
      E('div', { class: 'xwrt-ota-progress-meta' }, [this.progressBytes, this.progressState]),
    ]);
    this.progressWrap = E('div', { class: 'xwrt-ota-progress-card' }, [this.progressNode]);

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

    const page = E('div', { class: 'xwrt-ota' }, [
      E('style', {}, styles),
      E('div', { class: 'xwrt-ota-hero' }, [
        E('div', { class: 'xwrt-ota-hero-main' }, [
          E('div', {}, [
            E('h2', { class: 'xwrt-ota-hero-title' }, 'XWRT 在线更新'),
            E('p', { class: 'xwrt-ota-hero-sub' }, '自动匹配京东云雅典娜 / 亚瑟的 XWRT 正式版固件'),
          ]),
        ]),
        this.statusPill,
      ]),
      this.statusNode,
      E('div', { class: 'xwrt-ota-facts' }, [
        fact('model', '当前设备'),
        fact('current', '当前固件版本'),
        fact('latest', '最新版本'),
      ]),
      this.versionHint,
      this.progressWrap,
      E('div', { class: 'xwrt-ota-actions' }, [
        this.actionButton,
        this.cleanButton,
      ]),
      E('p', { class: 'xwrt-ota-note' }, [
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
