# Vercel 静态部署

本文交付可执行的部署步骤。**本项目没有在本次实现中发布到 Vercel，没有修改远端账户、域名、项目设置或 Deployment Protection。** 本地构建成功只证明生成了静态产物，不能证明生产域名可用。

## 构建配置

仓库根目录的 `vercel.json` 声明以下设置，Node 主版本由 `package.json` 的 `engines.node` 固定为 `24.x`：

| 设置 | 值 |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | `24.x` |
| 应用环境变量 | 无 |
| 数据库 / Functions / SSR | 不使用 |
| 计划 | Hobby，适用于家庭个人非商业用途 |

应用只有根路径。帮助、设置和本机榜都是页内面板，因此没有通配 rewrite、API 路由或运行时服务。静态资源随产物一起发布，不依赖外部图片站或字体 CDN。

2026-09-20 核验：[Vercel 官方支持 Vite 项目部署](https://vercel.com/docs/frameworks/frontend/vite)；[Node 版本说明](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)列出 `24.x`，并支持 `package.json` 的主版本约束。Vercel 自动维护该主版本下的次版本和补丁，不承诺云端恰好使用本机的 24.18.0。[Vite 入门文档](https://vite.dev/guide/)的 Node 要求为 20.19+、22.12+；本项目统一选择 24.x，以兼容当前构建与测试依赖。

## 发布前本地验证

```bash
node -v
npm -v
npm ci
npx playwright install chromium firefox webkit
npm run check
npm run preview
```

浏览器检查预览地址：首屏可玩，四档尺寸正确，声音默认关闭，设置 / 帮助 / 榜单可打开，刷新开新局。缺少浏览器或系统库时，应先解决依赖或记录受限项目；不能把未运行的浏览器测试写成通过。实际验证记录保存于 [`../TEST_REPORT.md`](../TEST_REPORT.md)。

## 由项目所有者执行发布

1. 将审核后的源码、`package-lock.json`、`package.json`、`vercel.json` 和文档提交到自己的 Git 仓库，再推送到已授权的远端。不要提交 `node_modules/`、本机凭据或临时测试服务配置。
2. 登录自己的 Vercel 账户，导入该仓库。开发者部署需要账户，玩家无需应用账户。
3. 确认项目根目录及上述 Vite 构建设置，确认 Node 为 24.x。环境变量保持空白；无需添加数据库、Functions、第三方 Analytics 或 Speed Insights 集成。
4. 阅读当前 Hobby 条款及额度，确认用途属于个人非商业，再在控制台发起部署。[Hobby 官方文档](https://vercel.com/docs/plans/hobby)明确个人非商业限制与资源用量边界，免费不代表无限流量或永久不变。
5. 检查构建日志与产物。如果失败，修正代码 / 依赖 / 构建设置后重新验证；不要以一张成功页面截图代替日志。
6. 使用**无痕窗口**访问固定的生产域名，确认页面无需 Vercel 登录即可打开并操作。如果实际出现平台访问保护，由项目所有者核对当前保护策略；本任务不代为修改账户或访问保护。
7. 将固定生产地址提供给家人，按下一节进行实机检查。预览域名、本地域名和生产域名的本机榜彼此独立，不会自动迁移或同步。

## 生产验收与故障诊断

下面项目当前均属于**发布后待验证**，不能由本地构建结果推断通过：

| 项目 | 操作和预期 |
| --- | --- |
| 匿名访问 | 无痕打开固定生产域名，无应用登录要求，无意外平台登录拦截 |
| 静态资源 | 开发者工具 Network 中 HTML、JS、CSS、站点图标正确返回；控制台无资源加载错误 |
| 根路径刷新 | 直接访问和刷新 `/` 均进入新棋盘 |
| 家庭 Mac | Safari / 常用浏览器，真实触控板点按、辅助点按、Ctrl＋点击与 Shift＋点击 |
| iPad / 手机 | 竖屏、横屏、长按、拖动滚动、多指缩放及插旗模式，参考人工验收文档 |
| 家庭网络 | 家庭宽带与手机蜂窝网络分别加载、刷新并完成游戏；记录日期、地区和网络，不推断所有地区稳定 |
| 成绩隔离 | 主动保存可保留；新局或刷新不恢复棋局；更换浏览器或域名不会读取另一个来源的成绩 |
| 免费静态范围 | 控制台检查未引入数据库、应用 Functions 或按量付费服务；关注实际静态资源用量 |

白屏时先确认根目录、`dist` 输出及 HTML 引用的资源路径；再检查浏览器是否仍请求上次构建的文件。站点图标缺失不会影响规则，但应在 Network 中定位 404。由于没有深层页面路由，不需要用全站 rewrite 掩盖不存在的资源路径。

若发布后需要回退，由项目所有者选择先前已验证的部署或提交重新构建。更换域名会改变本机存储来源；不使用 `localStorage.clear()` 作为排障手段，以免影响同源其他内容。
