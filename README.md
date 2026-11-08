# openwrt-ota

用于 XWRT 的 LuCI 在线固件升级插件，从 `1823774778/XWRT` 的 GitHub 最新正式版 Release 获取固件。

## 安装

安装包：`luci-app-xwrt-ota-1.0.0-r1.apk`（OpenWrt APK v3，noarch）。将安装包上传到路由器 `/tmp`，通过 SSH 执行：

```sh
apk add --allow-untrusted /tmp/luci-app-xwrt-ota-1.0.0-r1.apk
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

1. **检查更新**：读取 `/repos/1823774778/XWRT/releases/latest`，展示发布标签、发布时间和原始发布说明。
2. **匹配设备**：只选择本机对应的 `xwrt-*-qualcommax-ipq60xx-<profile>-squashfs-sysupgrade.bin`，兼容末尾追加 `-YYYY-MM-DD` 的文件名；不使用 `factory.bin`。缺少或匹配到多个固件时停止。
3. **下载并校验**：后台下载到 `/tmp/xwrt-ota`，显示进度；核对文件大小、GitHub 附件 SHA256（缺失时读取同一 Release 的 `sha256sums`），调用系统 `validate_firmware_image` 检查设备兼容性。
4. **安装更新**：二次确认并选择是否保留配置；刷写前重新核对 SHA256，再运行原生 `sysupgrade --test`，通过后调用 `sysupgrade`。不提供强制刷写选项。
5. **重连**：等待设备重启；不保留配置时默认尝试 `192.168.10.1` 和 `xwrt.lan`。

当前系统的源码版本和 Release 标签不属于同一种版本标识，同一源码也可能被重新编译，因此页面展示信息供核对，不将它们简单比较成“当前已是最新版”。固件没有可用 SHA256 时会停止。

**保留配置不等于保留插件。** 新固件如果没有预装本插件，升级后需要重新安装本 APK；其他自行安装的软件包同理。升级前请在 LuCI 的“备份/升级”页备份重要配置。

后端会串行执行更新任务，浏览器关闭后下载可继续。异常中断留下任务锁时，重启路由器会清除内存中的临时状态，再重新检查更新。出现错误时可查看 `/tmp/xwrt-ota/worker.log`、`curl-error.log`、`validation.log` 和 `upgrade.log`。

## 源码和构建

GitHub Actions 的 **Build APK** 工作流会在插件改动合并到 `main` 后自动构建，也可在 Actions 页面通过 **Run workflow** 手动运行。`main` 分支构建及校验成功后自动创建 Release，仅上传 `.apk` 附件；Release 正文包含插件作用、适配设备、安装使用方法、版本、源码提交和 SHA256。可直接到 [Releases](https://github.com/1823774778/openwrt-ota/releases/latest) 下载安装包。PR 和其他分支不会发布 Release，GitHub 自动生成的 Source code 归档不属于工作流上传的附件。

每次发布使用包含插件版本、构建编号和运行次数的独立标签。构建记录的 **Artifacts → luci-app-xwrt-ota-apk** 仍保留 APK 和 `sha256sums`，有效期 30 天。工作流固定官方 apk-tools 版本并核对源码 SHA256。

- `luci-app-xwrt-ota/`：标准 LuCI 软件包目录，含视图、后端、菜单和 ACL。
- `scripts/build-apk.py`：使用官方 `apk-tools 3.x` 的 `mkpkg` 生成独立安装包，不需要编译内核。

```sh
python3 scripts/build-apk.py --apk /path/to/apk
```

如需以后预装到固件，可将插件目录复制到 OpenWrt 源码的 `package/`，选择 `CONFIG_PACKAGE_luci-app-xwrt-ota=y` 后按固件正常流程编译。

已完成脚本、JavaScript 与 JSON 语法检查；真实 BusyBox ash + OpenWrt jshn 下的 21 项隔离后端检查；模拟后端下的浏览器下载/确认/取消流程；APK 完整性、解包一致性、隔离根安装/卸载及安装脚本执行检查。真实固件的软件包清单已确认包含全部依赖。当前沙箱出口的 GitHub 匿名 API 曾出现配额耗尽（403），插件会报告网络/API 限流错误；带授权连接读取的真实 Release 数据及实际固件 SHA256 已核对。没有连接实体路由器执行刷机，设备上的实际安装、闪存写入和重启仍需实机验证。
