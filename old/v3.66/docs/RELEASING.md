# HiCode 发布规范（RELEASING）

> 本文档固化 HiCode 的版本发布流程。每次发布照此执行，保证三档版本、归档、Git Tag 与 GitHub Release 资产的一致性。
> 执行中遇到本文档未覆盖的细节，由发布执行者自行决定，不回头反复确认。

## 一、三档版本定义与命名

每个版本号统一拆为三档发布，能力递进、版本号相同（同一套引擎，按档位开启能力）：

| 档位 | 名称 | 能力 |
| --- | --- | --- |
| `M` | 轻量版 | 仅全套 HIC 内核 |
| `R` | 标准版 | 内核 + 编译 Python 为 HTML（`py:(…)end`） |
| `X` | 全能版 | 内核 + 编译 Python 与 C++ 为 HTML（`py:(…)end` / `cpp:(…)end`） |

命名约定：

- **Git Tag**：`v{版本号}`（如 `v3.66`），锚定发布时的 main。
- **离线单文件**：`HiCode-v{版本号}{M|R|X}-offline.html`（如 `HiCode-v3.66X-offline.html`）。
- **归档目录**：`old/v{旧版本号}/`（如 `old/v3.01/`）。
- **网页端三版在线体验**：`/ide/?edition=m|r|x` 直达对应档位，顶栏可随时切换，选择记忆在本地。

## 二、发布流程（按序执行）

### 1. 归档旧版本

- 将当前线上版本完整快照至 `old/v{旧版本号}/`（整站文件，含 README）。
- 在历史版本索引页 `old/index.html` 补上旧版本入口链接。

### 2. 推进版本号与站点内容

版本号出现在以下位置，需一并对齐（当前以 v3.66 为例）：

- `ide/js/hic.js` — `HC.APP.version`
- `windows/index.html` / `android/index.html` — 顶栏 `verTag` 文案
- `download/build/build-offline.js` — 输出文件名与标题中的版本号
- `README.md` — 「当前版本」小节与「下载」链接
- `download/index.html` — 三档文件链接、更新说明

### 3. 打包三档离线单文件

```bash
node download/build/build-offline.js
```

脚本以 `windows/` 为内核，按 M/R/X 注入 `window.HIC_EDITION`，产出三份自包含单文件至 `download/`。脚本内置校验：若仍有未内联的外部资源会直接报错退出。

### 4. 提交并推送

```bash
git add -A
git commit -m "release: v{版本号} …"
git push origin main
```

### 5. 打 Git Tag（锚定 main）

```bash
git tag v{版本号}
git push origin v{版本号}
```

### 6. 建 GitHub Release 并上传资产

- 以 Tag `v{版本号}` 创建 Release，标题与 Tag 同名。
- Release 说明：三档差异（M/R/X）+ 本版更新点。
- 上传三档离线单文件 `HiCode-v{版本号}{M,R,X}-offline.html` 作为资产。

### 7. 验证

- GitHub Pages 生效后访问官网，确认「在线体验三版」直达链接可用。
- 下载三档离线单文件，双击本地打开，确认档位正确（顶栏徽标与能力按钮与档位一致）。

## 三、职责分工

- 打包类工作（生成三档离线单文件、上传 Release 资产、归档旧版本）由发布执行者完成，不留 TODO 给用户。
- 提交前无需用户反复审查；撰写过程遇到问题自行决定。

## 四、发布检查清单

- [ ] 旧版本已快照至 `old/v{旧版本号}/`
- [ ] `old/index.html` 历史索引已补链接
- [ ] 版本号已全文对齐（hic.js / verTag / build 脚本 / README / 下载页）
- [ ] 三档离线单文件已生成并通过脚本内置校验
- [ ] `main` 已提交并推送
- [ ] Git Tag `v{版本号}` 已打并推送
- [ ] GitHub Release 已创建，三档资产已上传
- [ ] 网页端三版在线体验链接与离线包档位均验证可用
