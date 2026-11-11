#!/usr/bin/env python3
# SPDX-License-Identifier: MIT

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


NAME = "luci-app-xwrt-ota"
VERSION = "1.2.3-r1"
DEPENDENCIES = "luci-base rpcd-mod-file curl ca-bundle jshn"


def main():
    workspace = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Build a noarch APK v3 using official apk-tools 3.x")
    parser.add_argument("--apk", default=shutil.which("apk"), help="Path to apk-tools 3.x with mkpkg support")
    parser.add_argument("--output", type=Path, default=workspace / f"{NAME}-{VERSION}.apk")
    args = parser.parse_args()
    if not args.apk:
        parser.error("apk-tools 3.x is required; provide --apk /path/to/apk")
    apk = str(Path(args.apk).resolve())
    subprocess.run([apk, "--version"], check=True)
    source = workspace / NAME
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="xwrt-ota-apk-") as temporary:
        temporary = Path(temporary)
        root = temporary / "root"
        shutil.copytree(source / "root", root)
        shutil.copytree(source / "htdocs", root / "www", dirs_exist_ok=True)
        (root / "usr/libexec/xwrt-ota").chmod(0o755)
        package_files = sorted("/" + str(item.relative_to(root)) for item in root.rglob("*") if item.is_file())
        metadata = root / "lib/apk/packages"
        metadata.mkdir(parents=True)
        (metadata / f"{NAME}.list").write_text("\n".join(package_files) + "\n")

        post_install = temporary / "post-install"
        post_install.write_text(
            "#!/bin/sh\n"
            '[ -z "${IPKG_INSTROOT:-}${root:-}" ] || exit 0\n'
            "rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/*\n"
            "[ ! -x /etc/init.d/rpcd ] || /etc/init.d/rpcd reload >/dev/null 2>&1\n"
            "exit 0\n"
        )
        post_install.chmod(0o755)
        for item in root.rglob("*"):
            item.chmod(0o755 if item.is_dir() or item == root / "usr/libexec/xwrt-ota" else 0o644)
            os.utime(item, (0, 0))
        os.utime(root, (0, 0))

        subprocess.run(
            [
                apk, "mkpkg",
                "--info", f"name:{NAME}",
                "--info", f"version:{VERSION}",
                "--info", "arch:noarch",
                "--info", "description:XWRT GitHub Release OTA updater for JDCloud Athena and Arthur",
                "--info", "license:MIT",
                "--info", "url:https://github.com/1823774778/XWRT",
                "--info", f"depends:{DEPENDENCIES}",
                "--info", "tags:openwrt:section=luci",
                "--script", f"post-install:{post_install}",
                "--script", f"post-upgrade:{post_install}",
                "--files", str(root),
                "--output", str(output),
            ],
            env={**os.environ, "SOURCE_DATE_EPOCH": "0"},
            check=True,
        )
    subprocess.run([apk, "verify", "--allow-untrusted", str(output)], check=True)
    print(f"Created {output}")


if __name__ == "__main__":
    main()
