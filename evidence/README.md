# 运行证据索引

这些文件来自实际实现的本地浏览器运行，不是设计概念图。测试用固定种子只在显式 `e2e` 模式启用，正式构建不读取 URL 种子。

| 证据 | 用途 |
| --- | --- |
| [最初交互样机](prototype/desktop-interactive.png) | 首轮真实展开与插旗；保留迭代记录，布局以最终截图为准 |
| [初始棋盘](screenshots/desktop-ready.png) | 蓝晶主题初级首屏 |
| [桌面初级](screenshots/desktop-beginner.png) | 真实数字、旗格和连开后的棋盘 |
| [桌面中级](screenshots/desktop-intermediate.png) | 16 × 16 棋盘 |
| [桌面高级](screenshots/desktop-expert.png) | 30 × 16 棋盘 |
| [手机窄屏](screenshots/narrow.png) | 390 CSS px 触屏模拟，常驻模式切换 |
| [设置](screenshots/settings.png) | 连开和页面内设置 |
| [获胜](screenshots/won.png) | 所有安全格打开，保存入口 |
| [失败](screenshots/lost.png) | 触雷格、地雷与错旗 |
| [本机榜](screenshots/leaderboard.png) | 玩家主动保存后的记录 |
| [自动连开](screenshots/auto-chord.png) | 自动档警告与实际连开结果 |
| [减少动效](screenshots/reduced-motion.png) | 关闭运动后的状态；这张图本身不证明动画关闭 |
| [生产产物首屏](screenshots/production-ready.png) | 正式 `dist` 的本地 HTTP 预览，无部署含义 |
| [交互录屏](video/interaction.webm) | 实际自动操作录像，含按压、展开、旗格、连开、快速重开、胜负、减少动效；没有音轨，不替代听感测试 |
| [截图元数据](capture.json) | 浏览器版本、视口、生成时间与页面异常 |
| [性能与配色测量](measurements.json) | 原始条件和结果，含测量范围与限制 |
| [生产烟测](production-smoke.json) | 静态资源 HTTP 状态、实际操作与刷新检查 |
| [浏览器依赖证据](environment/) | 共享 Linux 主机的本地 WebKit 依赖与实跑结果 |

重现截图／录像：`node scripts/capture.mjs`。重现测量：`node scripts/measure.mjs`。生产烟测：`npm run build && node scripts/smoke-production.mjs`。脚本各自只监听 `127.0.0.1`，使用端口 4177／4178／4179，完成后关闭浏览器和自己的服务。运行前不要占用这些端口。

完整测试结论见 [TEST_REPORT.md](../TEST_REPORT.md)，实际 Mac、iPad 和手机待执行步骤见 [MANUAL_TESTS.md](../docs/MANUAL_TESTS.md)。
