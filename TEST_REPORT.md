# 轻扫雷 V1 实测报告

验证日期：2026-09-20。项目合同：[`plan.md`](plan.md)。所有运行均在授权的本地工作目录中进行；没有发布站点或操作远端账户。

## 结果与复测

最终 `npm run check` **退出码 0**：类型、lint、138 项单元／属性测试、静态构建和 117 项浏览器集成测试全部通过。完整记录在 [`evidence/check.log`](evidence/check.log)，来自实际执行，不由测试数量推算生成。浏览器用例无跳过、无重试；完整浏览器阶段约 2.9 分钟。

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 已从 lockfile 成功重装，141 个依赖包 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm run test:unit` | 6 个文件，138 / 138 通过，约 3.62 秒 |
| `npm run build` | 通过；生成 `dist/`，主 JS 261.48kB / gzip 83.13kB，CSS 22.74kB / gzip 6.22kB |
| Chromium 153.0.8010.12 | 39 / 39 通过 |
| Firefox 155.0 | 39 / 39 通过；虚拟音频输出 |
| WebKit 26.6 | 39 / 39 通过；本地动态库与软件绘制 |
| 生产 `dist` 本地 HTTP 烟测 | 通过；首屏、首点、设置、刷新重置、静音默认值、资源 200 / 304、测试种子分支移除 |
| Vercel 实际部署 | 未执行；仅交付静态产物和部署步骤 |

普通具备浏览器依赖的开发机：

```bash
npm ci
npx playwright install chromium firefox webkit
npm run check
```

这台共享 Linux 服务器的实际完整命令：

```bash
LIGHT_MINES_WEBKIT_EXECUTABLE_PATH="$PWD/scripts/browser-env.sh" \
  bash scripts/with-test-audio.sh npm run check
```

WebKit 用户态库的准备方法与 Firefox 虚拟音频说明见 [`docs/BROWSER_ENV.md`](docs/BROWSER_ENV.md)。浏览器用例使用 `127.0.0.1:4173`，两个 worker，不并行启动第二份同端口 runner。固定种子只属于 Vite `e2e` 模式；正式构建使用 `crypto.getRandomValues` 产生新局种子，不使用 URL 固定题。

## 覆盖范围

| 合同范围 | 实现与已执行证据 |
| --- | --- |
| 四档与默认值 | 配置为 6×6/4、9×9/10、16×16/40、30×16/99；默认初级、单击、静音；规则与浏览器预设检查 |
| 延迟布雷与首点保护 | 全部首点 × 四档 × 3 种种子，共 2,559 个盘面检查；精确雷数、首点八邻域、无放回采样、无效配置报错、提前旗子不改变落点 |
| 翻开与胜负 | 迭代空白展开、10,000 格非递归用例、跳过旗格、负剩余旗数、只有安全格全开判胜、仅插满旗不胜、终局冻结 |
| 自动事务 | 错旗三种模式都可触雷；每个批次先查目标雷、事务末尾才判胜；受影响数字固定队列、共享邻域去重、无进展停止、不扫描远处线索；256 个固定种子动作序列和 128 局正确插旗 oracle 用例 |
| 单击／双击 | 隐藏格单击立即开；第二下不继承刚打开格子的双击资格；预先已开数字的双击连开、时间门槛、不同目标、慢双击与键盘显式连开 |
| 指针与触屏 | Pointer Events 单通道；右键／contextmenu 两种顺序、Ctrl、Shift；350ms 长按、10px 移动容差、长按后松手不翻、拖动／滚动／多指／失去捕获／取消清理 |
| 键盘与披露 | roving tabindex、方向键、Enter/Space/F、表单保护、辅助技术式 detail=0 激活、隐藏格只披露坐标与覆盖状态、模态 Tab 环绕与 Esc 还原焦点 |
| 计时 | 注入时钟、首次有效翻格启动、终局固定、超过 999 秒、后台时间差语义、计时隐藏仍计分、负耗时拒绝入榜；计时 tick 不产生棋格 DOM 更新 |
| 动效 | 事件 ID 同批／跨批去重；一事务一批反馈；新局清旧动画／声音；再次操作取消目标装饰；最大展开延时＋时长 ≤280ms；减少动效和系统偏好；后台丢弃而不补播 |
| 音效 | 翻开／旗／连开／胜／败五类原创音色；默认不开 AudioContext；主动开启后原生浏览器音频节点运行；静音无新声部；最多六声部与释放测试 |
| 本机榜 | 只主动保存、四称呼、每难度手动／自动分组 Top 10、幂等 gameId、输入字段与数量验证、关闭榜零访问直至获胜、损坏与拒写不崩溃、仅清自己的 key |
| 刷新与隐私 | 浏览器 instrumentation 检查 localStorage getter/get/set/remove 与 sessionStorage；刷新仅保留主动保存的榜；棋局、设置、称呼选择不恢复；无数据上传接口 |
| 响应式 | 1280×800 中级棋盘及连开控件落在视口内；390×844 触屏模拟；高级至少 36px 触屏格、局部滚动，无页面水平溢出；大格子不重开 |
| 终局视觉 | 原地显示结果、触发雷与错旗形状、成功保存入口；胜利前后棋盘位置相同；可立即新局 |
| 静态交付 | Vite `dist`、Node 24.x、lockfile、无运行时环境变量／后端／数据库／外部素材依赖；`vercel.json` 没有不需要的重写规则 |

属性测试的真值 oracle 仅用于测试正确性，不属于产品求解器。自动化触屏使用 Playwright 的触屏模拟以及明确标注的合成指针事件，不能证明真实手指的滚动、长按或手感。

单元测试共 6 文件：核心／属性 29 项、输入 58 项、动效 15 项、存储与声音 36 项。浏览器每引擎覆盖 39 项：规则与页面 7、输入 18、展示 3、存储 11。断言检查真实交互结果，不以截图数量代替行为验证。

## 截图与动作证据

保留了首轮可交互样机截图 [`prototype/desktop-interactive.png`](evidence/prototype/desktop-interactive.png)，以及完成规则集成、触屏和榜单修正后的最终截图。以下均来自实际代码：

| 状态 | 实际截图 |
| --- | --- |
| 初级首屏／游戏中 | [首屏](evidence/screenshots/desktop-ready.png) · [游戏中](evidence/screenshots/desktop-beginner.png) |
| 中级／高级 | [中级](evidence/screenshots/desktop-intermediate.png) · [高级](evidence/screenshots/desktop-expert.png) |
| 窄屏 | [390px 触屏模拟](evidence/screenshots/narrow.png) |
| 设置／本机榜 | [设置](evidence/screenshots/settings.png) · [主动保存后的榜单](evidence/screenshots/leaderboard.png) |
| 胜利／失败 | [胜利](evidence/screenshots/won.png) · [失败](evidence/screenshots/lost.png) |
| 自动／减少动效 | [自动档](evidence/screenshots/auto-chord.png) · [减少动效后的状态](evidence/screenshots/reduced-motion.png) |
| 正式构建 | [本地生产产物首屏](evidence/screenshots/production-ready.png) |

[`interaction.webm`](evidence/video/interaction.webm) 是浏览器真实运行的自动操作录屏，包含按压、旗格、连开、大面积展开、连续操作、快速重开、终局及系统减少动效。录像没有音轨。静态截图只用于检查最终视觉；动效逻辑还由控制器和浏览器测试检查。可重复人工步骤位于 [`docs/MANUAL_TESTS.md`](docs/MANUAL_TESTS.md)，没有执行的人工条目不得填写“通过”。

## 性能与配色实测

原始结果：[`evidence/measurements.json`](evidence/measurements.json)。环境为共享 Linux、Xeon Platinum 8336C、128 个逻辑 CPU；无 CPU 降速模拟。该测量不能外推到家庭 Mac 或手机。

| 场景 | 实际结果 |
| --- | --- |
| 规则层高级／自动，1,000 个不同种子的首点事务 | 中位 0.132ms，P95 0.278ms，最大 2.369ms；不含 React 或绘制 |
| Chromium 开发构建，高级 480 格，40 次重开＋翻开 | 合成可访问点击到第二个 requestAnimationFrame：中位 33.5ms，P95 85.0ms，最大 85.4ms；包含帧调度，不能当成规则耗时或 FPS |
| 同一浏览器测量期间长任务 | 记录到 53ms 和 50ms 两个条目；不宣称零阻塞 |
| 连续 40 次重开后 | 仍为 480 个格子，无累积格子节点 |
| 配色 | 使用 sRGB 相对亮度公式核算 14 对主要实色 token；最低为数字 6 的 4.99:1，其余见 JSON |

配色结果覆盖列出的文字／数字／图标颜色，不是对所有透明层、状态、焦点、设备、读屏的完整无障碍合规审计。没有宣称全平台稳定 60 FPS。真实设备性能与主观音量／听感仍待验证。

## 修复及环境记录

- TypeScript 最新主版本与 typescript-eslint 声明范围冲突，改为兼容的 TypeScript 6.0.3 并锁定依赖，没有使用忽略 peer dependency 的安装方式。
- 首轮桌面截图发现触屏栏被通用分段控件样式覆盖，已修复；窄屏 390px 的初级九列可完整显示；小高度笔记本采用紧凑布局。
- 浏览器验证发现模态 Tab 可离开页面控件，增加显式焦点环绕；Escape 还原焦点已测。
- 空闲滚动／挂载清理曾误启动 500ms 合成点击抑制，已修复为仅取消真实指针时保护，补了单测和浏览器回归。
- 动效消费曾对同批重复 ID 重复启动，以及销毁后仍能消费，均已修复并测试。
- 品牌改为非导航标记，避免点击后无提示丢局；从自动局打开榜单直接显示自动分类。
- 首轮终局冻结用例因 Playwright 尊重 `aria-disabled` 而没有发出测试输入；改为显式强制终局输入，并仅比较规则相关状态，未改变产品胜负逻辑。
- 生产烟测最初误把刷新后的合法 HTTP 304 当作失败；断言已允许 200／304，仍拒绝失败资源与外部请求。
- Chromium 完整浏览器安装成功；额外 headless shell 下载曾连接中断。实际测试使用 `channel: chromium`，没有绕过 TLS 检验。
- WebKit 缺少动态库，9 个 Ubuntu 包约 46MB 解压到项目缓存，使用官方已下载浏览器和本地启动脚本；没有系统安装、服务重启或改共享浏览器文件。
- Firefox 在无输出设备的主机上无法启动原生音频上下文。先证实 PulseAudio/cubeb 环境原因，再使用本任务专用虚拟输出完成音频图测试；没有修改应用代码或弱化音效断言。虚拟输出不证明声音可听、音量合适或真实设备已经解锁成功。
- Bash 偶尔提示 Conda `libtinfo.so.6` 版本信息缺失，以及 Node 的颜色环境提示；实际命令结果按退出码与断言记录。

## 明确未验证与发布边界

- 未使用真实 Mac 触控板、macOS Safari、iPad 或手机；350ms 长按、10px 容差需真机手感调整。
- 未完成 VoiceOver／真实读屏器体验审查；已验证的是 DOM 可访问名称、键盘导航和合成可访问点击。
- 未进行真实扬声器／耳机听感测试，录屏没有音轨。
- 未在 Vercel 创建项目、部署、修改 Deployment Protection 或操作远端账户；没有生产域名、生产无痕访问、家庭宽带与手机网络结果。
- 静态产物与 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) 已交付；发布后验收由部署者按文档执行。本地构建及预览不等于部署。
- 无猜题库、冒险模式、第二套主题和 PWA 不属于 V1，没有借这些内容替代必需功能。

本任务仅创建本地开发／测试进程，测试包装脚本限制自己的服务并清理。不使用 GPU、外部 LLM、数据库、真实用户数据或真实账户。
