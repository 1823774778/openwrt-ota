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
  available: '发现固件',
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
  load() {
    return runHelper(['status']);
  },

  reportError(error) {
    ui.addNotification(null, E('p', {}, error.message), 'error');
  },

  async refresh() {
    try {
      this.update(await runHelper(['status']));
    } catch (error) {
      this.statusNode.textContent = '无法连接更新服务，正在等待重连…';
      this.downloadButton.disabled = true;
      this.upgradeButton.disabled = true;
    }
  },

  async start(action) {
    this.setBusy(true);

    try {
      await runHelper([action]);
      await this.refresh();
    } catch (error) {
      this.reportError(error);
      await this.refresh();
    }
  },

  setBusy(busy) {
    this.checkButton.disabled = isReadonly || busy;
    this.cleanButton.disabled = isReadonly || busy;
    this.downloadButton.disabled = isReadonly || busy || !this.data?.asset_name;
    this.upgradeButton.disabled = isReadonly || busy || this.data?.phase !== 'ready';
  },

  update(data) {
    this.data = data;
    this.statusNode.textContent = `${phases[data.phase] || data.phase} · ${data.message}`;
    this.statusNode.className = data.phase === 'error' ? 'alert-message danger' : 'alert-message';
    this.fields.model.textContent = data.model || data.board || '未知设备';
    this.fields.current.textContent = [
      data.current_distribution,
      data.current_version,
      data.current_revision,
    ].filter(Boolean).join(' ') || '无法读取';
    this.fields.latest.textContent = data.name || '点击「检查更新」读取';
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

    const sourceVersion = (data.source_revision || '').replace(/^snapshot-/, '');
    this.versionHint.textContent = sourceVersion && sourceVersion === data.current_revision
      ? '当前系统与该 Release 的源码版本相同；同一源码可能被重新构建，请核对发布日期和发布说明。'
      : '版本信息来自设备与 GitHub Release；请核对发布说明后确认升级。';
    this.setBusy(Boolean(data.busy));

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
    if (!data || data.phase !== 'ready' || data.busy || isReadonly) return;

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
        submit.disabled = true;
        this.setBusy(true);

        try {
          await runHelper(['upgrade', keep.checked ? '1' : '0', data.sha256]);
          ui.hideModal();
          await this.refresh();
        } catch (error) {
          ui.hideModal();
          this.reportError(error);
          await this.refresh();
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
    this.checkButton = E('button', {
      class: 'btn cbi-button-action',
      click: ui.createHandlerFn(this, 'start', 'check'),
    }, '检查更新');
    this.downloadButton = E('button', {
      class: 'btn cbi-button-positive',
      click: ui.createHandlerFn(this, 'start', 'download'),
    }, '下载并校验');
    this.upgradeButton = E('button', {
      class: 'btn cbi-button-negative',
      click: ui.createHandlerFn(this, 'confirmUpgrade'),
    }, '安装更新');
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
        row('current', '当前系统'),
        row('latest', '最新发布'),
        row('tag', 'Release 标签'),
        row('published', '发布时间'),
        row('asset', '匹配固件'),
        row('size', '固件大小'),
        row('sha256', 'SHA256'),
      ]),
      this.versionHint,
      this.progressWrap,
      E('div', { class: 'cbi-page-actions', style: 'display:flex;flex-wrap:wrap;gap:8px' }, [
        this.checkButton,
        this.downloadButton,
        this.upgradeButton,
        this.cleanButton,
      ]),
      E('p', {}, [
        E('a', { href: L.url('admin/system/flash') }, '升级前先备份系统配置'),
        '。保留配置不等于保留额外安装的软件包。',
      ]),
      E('div', { class: 'cbi-section' }, [
        E('h3', {}, '发布说明'),
        this.notesNode,
      ]),
    ]);

    this.update(data);
    poll.add(() => this.refresh(), 2);
    return page;
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null,
});
