# openwrt-ota

用于 XWRT 的 LuCI 在线固件升级插件，从 `1823774778/XWRT` 的 GitHub 最新正式版 Release 获取固件。

## 安装

安装包：`luci-app-xwrt-ota-1.2.3-r1.apk`（OpenWrt APK v3，noarch）。将安装包上传到路由器 `/tmp`，通过 SSH 执行：

```sh
apk add --allow-untrusted /tmp/luci-app-xwrt-ota-1.2.3-r1.apk
```

随后退出并重新登录 LuCI，在 **系统 → XWRT 在线更新** 中使用。依赖由 APK 自动处理：`luci-base`、`rpcd-mod-file`、`curl`、`ca-bundle`、`jshn`。设备须能通过 HTTPS 访问 GitHub API 和 Release 下载地址。

如果安装后没有出现菜单，可执行：

```sh
rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/*
/etc/init.d/rpcd restart
```

然后刷新并重新登录。安装包没有签名，因此安装该本地文件需要 `--allow-untrusted`；无需修改全局 APK 信任设置。

## 适配范围

- 京东云雅典娜 RE-CS-02：`jdcloud,re-cs-02`。
- 京东云亚瑟 RE-SS-01：`jdcloud,re-ss-01`。
- 平台：`qualcommax/ipq60xx`，使用现代 JavaScript LuCI 和 APK 的 XWRT。
- 基准：`1823774778/XWRT` 的 ImmortalWrt `owrt` 构建环境，APK 工具版本 3.0.5。

本安装包没有原生二进制，不依赖这两款设备之间的 CPU 差别；未适配旧版 Lua LuCI、opkg/IPK 系统、x86 和 Rockchip 固件。

## 更新流程

1. **进入页面自动检查**：读取 `/repos/1823774778/XWRT/releases/latest`；已有后台任务时跟随进度。
2. **比较构建日期时间**：优先读取概览版本标签同源的 `/etc/xwrt-build-time`，兼容解析系统 `release.description` 中的完整时间；与 Release 标签中的北京时间精确比较到秒。相同或本机更新时提示“当前为最新版本”，只有远端更新时才允许下载。旧固件没有完整构建时间时提示“无法判断版本”，不使用源码 revision、系统当前时间或发布时间代替。
3. **匹配设备**：只选择本机对应的 `xwrt-*-qualcommax-ipq60xx-<profile>-squashfs-sysupgrade.bin`，兼容末尾追加 `-YYYY-MM-DD` 或 `-YYYY-MM-DD-HH.MM.SS` 的文件名；不使用 `factory.bin`。缺少或匹配到多个固件时停止。
4. **下载并校验**：后台下载到 `/tmp/xwrt-ota`，核对文件大小、GitHub 附件 SHA256（缺失时读取同一 Release 的 `sha256sums`）和系统设备兼容性。已有相同大小、SHA256 的完整缓存时直接重新校验复用，不再下载；并发请求也不会发起第二次下载。
5. **安装更新**：二次确认并选择是否保留配置；刷写前重新核对版本和 SHA256，再运行原生 `sysupgrade --test`，通过后调用 `sysupgrade`。不提供强制刷写选项。
6. **重连**：等待设备重启；不保留配置时默认尝试 `192.168.10.1` 和 `xwrt.lan`。

页面采用纵向布局：当前设备、当前固件版本、最新版本三项信息逐行堆叠显示，窄屏时标签与值自动改为上下排列。面板和按钮优先使用 [luci-theme-vantage](https://github.com/anothaDev/luci-theme-vantage) 的 `--v-*` 设计变量与原生 `.btn`、`.cbi-button-*` 组件，并兼容 [luci-theme-argon](https://github.com/jerrykuku/luci-theme-argon) 等主题的回退配色。下载时显示带渐变、流光动画和百分比的自定义进度条，校验与刷写阶段使用不确定进度动画。

页面操作区只有两个按钮：“清理缓存”固定显示；动态按钮按状态显示灰色“暂无更新”、“下载版本”或“安装更新”。下载完成后切换到其他页面不会清理固件，再次进入会重新检查并显示“已下载完成，可更新”；未完成校验的文件不会直接允许安装。在线检查失败但存在已验证的新固件缓存时，会说明检查失败并允许复用缓存。缓存保存在内存 `/tmp`，只有主动清理、重新下载其他版本或路由器重启时才会失效。

**保留配置不等于保留插件。** 新固件如果没有预装本插件，升级后需要重新安装本 APK；其他自行安装的软件包同理。升级前请在 LuCI 的“备份/升级”页备份重要配置。

后端会串行执行更新任务，浏览器关闭后下载可继续。异常中断留下任务锁时，重启路由器会清除内存中的临时状态，再重新检查更新。出现错误时可查看 `/tmp/xwrt-ota/worker.log`、`curl-error.log`、`validation.log` 和 `upgrade.log`。

## 源码和构建

GitHub Actions 的 **Build APK** 工作流仅手动运行，提交文件、推送代码和更新 PR 均不会自动构建。需要构建时，进入 Actions → Build APK → Run workflow，选择 `main` 后运行。`main` 分支手动构建及校验成功后自动创建 Release，仅上传 `.apk` 附件；Release 正文包含插件作用、适配设备、安装使用方法、版本、源码提交和 SHA256。可直接到 [Releases](https://github.com/1823774778/openwrt-ota/releases/latest) 下载安装包。其他分支手动构建不会发布 Release，GitHub 自动生成的 Source code 归档不属于工作流上传的附件。

每次发布使用包含插件版本、构建编号和运行次数的独立标签。构建记录的 **Artifacts → luci-app-xwrt-ota-apk** 仍保留 APK 和 `sha256sums`，有效期 30 天。工作流固定官方 apk-tools 版本并核对源码 SHA256。

- `luci-app-xwrt-ota/`：标准 LuCI 软件包目录，含视图、后端、菜单和 ACL。
- `scripts/build-apk.py`：使用官方 `apk-tools 3.x` 的 `mkpkg` 生成独立安装包，不需要编译内核。

```sh
python3 scripts/build-apk.py --apk /path/to/apk
```

如需以后预装到固件，可将插件目录复制到 OpenWrt 源码的 `package/`，选择 `CONFIG_PACKAGE_luci-app-xwrt-ota=y` 后按固件正常流程编译。

1.2.3 已完成脚本、JavaScript、Python 和 JSON 语法检查，并在加载真实 Vantage 主题样式的隔离页面中验证了浅色 / 深色模式、纵向信息列表、青柠主色按钮、自动检查、同版本置灰、下载进度条、安装确认、无法判断版本和只读权限。后端逻辑与 1.1.0 相同，仅版本号和 User-Agent 变化，沿用此前真实 BusyBox ash + OpenWrt jshn 的 41 项隔离检查（含切页缓存复用，浏览器实测固件下载请求仍为 1 次）。没有为本次修改自动构建 APK，需按上述步骤手动运行工作流。

此前版本还完成了 APK 完整性、解包一致性、隔离根安装/卸载及安装脚本执行检查。真实固件的软件包清单包含全部依赖。GitHub 匿名 API 配额耗尽时会报告网络/API 限流错误。没有连接实体路由器执行刷机，设备上的实际安装、闪存写入和重启仍需实机验证。
