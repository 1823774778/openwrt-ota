include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-xwrt-ota
PKG_VERSION:=1.2.3
PKG_RELEASE:=1
PKG_LICENSE:=MIT

LUCI_TITLE:=XWRT GitHub Release OTA updater
LUCI_DEPENDS:=+luci-base +rpcd-mod-file +curl +ca-bundle +jshn
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
