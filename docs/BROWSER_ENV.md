# 共享 Linux 主机上的浏览器测试环境

实际环境为 Ubuntu 22.04.4 LTS、x86_64。Playwright 已下载 WebKit 2359，但主机缺少部分动态库。没有进行系统安装、修改系统服务或修改共享 Playwright 浏览器文件。本项目仅将 Ubuntu 包下载、解压到被 Git 忽略的 `.cache/browser-libs/`；库与安装包合计约 46 MB。准备时共享磁盘使用率为 98%，可用约 90 GB。

## 本机可重复准备步骤

以下命令适用于这次 Ubuntu 22.04 x86_64 环境，其他发行版需重新检查依赖。无需 `sudo`。包版本来自当前主机配置的 Ubuntu 软件源；软件源更新后版本可能变化。

```bash
npm ci
npx playwright install webkit
mkdir -p .cache/browser-libs/debs .cache/browser-libs/root
(
  cd .cache/browser-libs/debs
  apt-get download \
    libevent-2.1-7 libgstreamer-plugins-bad1.0-0 libflite1 \
    libavif13 libgav1-0 libyuv0 libva-drm2 libva2 libabsl20210324
)
for archive in .cache/browser-libs/debs/*.deb; do
  dpkg-deb -x "$archive" .cache/browser-libs/root
done
chmod +x scripts/browser-env.sh
```

实际下载版本：

| 包 | 版本 |
| --- | --- |
| libevent-2.1-7 | 2.1.12-stable-1ubuntu0.1 |
| libgstreamer-plugins-bad1.0-0 | 1.20.3-0ubuntu1.1 |
| libflite1 | 2.2-3 |
| libavif13 | 0.9.3-3 |
| libgav1-0 | 0.17.0-1build1 |
| libyuv0 | 0.0~git20220104.b91df1a-2 |
| libva-drm2 | 2.14.0-1 |
| libva2 | 2.14.0-1 |
| libabsl20210324 | 0~20210324.2-2ubuntu0.3 |

Playwright 自带的 MiniBrowser 启动脚本会覆盖 `LD_LIBRARY_PATH`。因此只给 `npm` 设置该变量并不足够。项目脚本 [browser-env.sh](../scripts/browser-env.sh) 直接启动同一份已下载的 WPE MiniBrowser，设置浏览器自带库、本地解压库和资源目录，并强制软件绘制。只支持 headless；不修改浏览器安装目录，不复制浏览器，也不改变宿主环境。

## 运行项目 WebKit 用例

在 Playwright 配置的 WebKit 项目中，`launchOptions.executablePath` 可通过 `LIGHT_MINES_WEBKIT_EXECUTABLE_PATH` 指定。准备本地库后执行：

```bash
LIGHT_MINES_WEBKIT_EXECUTABLE_PATH="$PWD/scripts/browser-env.sh" \
  npm run test:e2e -- --project=webkit
```

未设置该变量时仍使用 Playwright 官方启动方式。在已具备官方依赖的机器上不需要这个脚本；此脚本也不属于静态站点构建或部署产物。

不要与另一份使用相同 `4173` 端口的 E2E 任务同时启动。下面的独立启动检查使用 `data:` 页面，不启动服务器、不占用端口：

```bash
timeout 60s node --input-type=module <<'JS'
import { webkit } from 'playwright';
import { resolve } from 'node:path';
const browser = await webkit.launch({
  executablePath: resolve('scripts/browser-env.sh'),
  headless: true,
  timeout: 30_000,
});
try {
  const page = await browser.newPage();
  await page.goto('data:text/html,<title>Local WebKit verification</title><button id="b">0</button><script>document.querySelector("button").onclick=event=>event.target.textContent=Number(event.target.textContent)+1</script>');
  await page.locator('#b').click();
  const count = await page.locator('#b').textContent();
  if (count !== '1') throw new Error('Browser interaction failed');
  console.log({ browser: 'webkit', version: browser.version(), title: await page.title(), count });
} finally {
  await browser.close();
}
JS
```

## 实测证据与边界

`evidence/environment/webkit-local-launch.json` 由实际 browser/page 操作写出；对应 PNG 是该页面的实际截图。检查得到 WebKit 26.6，页面标题正确，点击后按钮为 `1`。`webkit-dependencies.txt` 记录包版本、缓存占用和动态链接检查。

这里只证明 Linux headless WebKit 启动与浏览器交互可用；项目 E2E 测试结果另见 `TEST_REPORT.md`。它不证明真实 macOS Safari、Mac 触控板或 iPad 已通过。浏览器的模拟 User-Agent 包含 Macintosh 和 Safari，不代表实际运行主机是 Mac。这个无服务器检查也不证明生产部署成功。

无需保留常驻进程。检查在 `finally` 中关闭浏览器；依赖缓存用于后续复测，可以单独删除本项目的 `.cache/browser-libs/`，不要清理其他任务的浏览器缓存。

## Firefox 音频环境诊断

本机 Firefox 155.0 的真实 Web Audio 用例最初无法等到 `running`。这次失败不是游戏没有响应用户点击，也不是仅丢失了 `statechange` 事件：独立最小按钮页和实际应用页都记录到可信点击、活跃的用户激活状态、一次真实 `AudioContext` 构造和一次 `resume()`，但上下文一直 `suspended`，`currentTime` 为 0，`resume()` 既未完成也未拒绝。

开启 Firefox 的 cubeb / MediaTrackGraph 诊断日志后，出现 `couldn't init pulse's context` 与 `Output number of channels is 0`。主机有 PulseAudio 15.99.1 与 `pactl` 程序，但没有可用的 PulseAudio 输出服务，`/dev/snd` 只有 seq / timer，没有播放设备。结论是此服务器的音频输出环境受限；没有因此修改自动播放权限、模拟 `AudioContext` 或放宽音效断言。

项目提供 [`with-test-audio.sh`](../scripts/with-test-audio.sh)，为浏览器建立短时独立的虚拟输出。[PulseAudio 模块文档](https://wiki.freedesktop.org/www/Software/PulseAudio/Documentation/User/Modules/)提供 null sink 和本地原生协议模块；本脚本只加载这两个模块，不发现或占用硬件设备。

脚本隔离方式：

- 在 `mktemp` 创建的私有目录中生成 Unix socket、认证 cookie、运行与状态目录；不监听 TCP，不使用匿名认证。
- `PULSE_SERVER`、`PULSE_COOKIE` 等配置只传给该次命令和其子进程；不修改用户 / 系统的 PulseAudio 配置，不接管或重启已有 daemon。
- 禁止自动启动其他音频服务，不启用实时调度或高优先级；独立 daemon 有 600 秒上限。
- 命令退出、失败或收到信号后，仅停止本脚本创建的进程，删除它的临时目录，将日志保留在 `evidence/environment/pulseaudio.log`。不使用全局 `pulseaudio --kill`。

实际应用页上的独立复测记录在 [`firefox-virtual-audio.json`](../evidence/environment/firefox-virtual-audio.json)：上下文从 `suspended` 转为 `running`，`resume()` 完成，音频时钟前进；插旗创建一个原生振荡器，静音后的动作没有新增声部。测试浏览器与该次 PulseAudio 进程均已关闭。日志中的 D-Bus 无显示环境警告不影响这个独立 Unix socket 与虚拟输出。

上述证据证明 Firefox 的真实 Web Audio 图可以运行和受控停止，**不证明扬声器输出、耳机音质、音量舒适度或真实 Safari 的音频策略已经验收**。

## 此服务器上的完整检查命令

完成上面的浏览器安装与本地库准备后执行：

```bash
LIGHT_MINES_WEBKIT_EXECUTABLE_PATH="$PWD/scripts/browser-env.sh" \
  bash scripts/with-test-audio.sh npm run check
```

`browser-env.sh` 是 Playwright 的 WebKit `executablePath`，不是任意命令包装器。`with-test-audio.sh` 才包装整个检查命令，为 Firefox 及其他测试浏览器提供同一次独立虚拟输出。普通已有音频设备、已安装官方浏览器依赖的桌面机器无需这两项环境适配。

完整项目测试是否通过仍以 [`TEST_REPORT.md`](../TEST_REPORT.md) 和实际检查日志为准；单独的环境诊断不能代替全部测试。虚拟音频输出仅用于本地自动化，不会进入静态网站产物，也不改变 Vercel 构建配置。
