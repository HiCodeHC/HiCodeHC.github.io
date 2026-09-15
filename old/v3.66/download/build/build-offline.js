/* ============================================================
 * HiCode 离线单文件打包脚本
 * 用途：把网页端 IDE（ide/）打包为一个自包含 HTML，
 *       可在无网络环境直接双击运行（即「把网页端 HTML 搬到本地」）。
 *       产物：download/HiCode-ide-offline.html
 *       该单文件也是安卓端（.apk / WebView）与电脑端（.exe / 壳）的内核。
 * 用法：node build/build-offline.js
 * ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", ".."); // /workspace/repo
// 打包桌面版（windows/）：差异分支 ide/ 现为「UA 检测跳转入口页」，真正可运行的编辑器在 windows/ 与 android/
const IDE = path.join(ROOT, "windows");
const OUT_DIR = path.join(ROOT, "download");

// v3.66 三版发布：R(标准,+py) / M(轻量,仅hic) / X(全能,+py+cpp)。
// 同一套引擎按 HIC_EDITION 决定运行时能编译哪些语言，并在顶栏显示对应版本号。
const EDITIONS = {
  R: { code: "r", name: "R·标准版", note: "内核 + Python 编译" },
  M: { code: "m", name: "M·轻量版", note: "仅 HIC 内核" },
  X: { code: "x", name: "X·全能版", note: "内核 + Python + C++ 编译" }
};

function buildEdition(edKey) {
  const ed = EDITIONS[edKey];
  let html = fs.readFileSync(path.join(IDE, "index.html"), "utf8");

  /* 1) 图标内联为 base64，避免本地 file:// 找不到 ../assets */
  const logoPath = path.join(ROOT, "assets", "hicode-logo.jpg");
  if (fs.existsSync(logoPath)) {
    const b64 = fs.readFileSync(logoPath).toString("base64");
    html = html.replace(
      '<link rel="icon" href="../assets/hicode-logo.jpg" type="image/jpeg" />',
      function () { return '<link rel="icon" href="data:image/jpeg;base64,' + b64 + '" type="image/jpeg" />'; }
    );
  }

  /* 2) 样式内联 */
  const css = fs.readFileSync(path.join(IDE, "css", "style.css"), "utf8");
  html = html.replace(
    '<link rel="stylesheet" href="css/style.css" />',
    function () { return "<style>\n" + css + "\n</style>"; }
  );

  /* 3) 脚本内联（顺序：store → hic → editor → app）
     注意：用「函数替换」而非字符串替换，避免源码中的 $& 等被当作
     正则在替换串中的特殊模式（app.js 的 \"\\$&\" 会触发此问题）。 */
  function inlineFile(src) {
    return "<script>\n" + fs.readFileSync(path.join(IDE, "js", src), "utf8") + "\n</script>";
  }
  html = html
    .replace('<script src="js/store.js"></script>', function () { return inlineFile("store.js"); })
    .replace('<script src="js/hic.js"></script>', function () { return inlineFile("hic.js"); })
    .replace('<script src="js/editor.js"></script>', function () { return inlineFile("editor.js"); })
    .replace('<script src="js/app.js"></script>', function () { return inlineFile("app.js"); });

  /* 4) 注入发布形态：让引擎/顶栏识别为对应版本 */
  html = html.replace(
    "<head>",
    "<head>\n<script>window.HIC_EDITION='" + ed.code + "';<\/script>"
  );

  /* 5) 版本文案标记为该版本的「本地版」 */
  const longTitle = "HiCode · 桌面开发环境 v3.66（电脑端）";
  const cwTitle = "HiCode · HIC 桌面开发环境 v3.66（电脑端）";
  html = html.replace(longTitle, "HiCode · 本地开发环境 v3.66" + edKey + "（" + ed.name + "）");
  html = html.replace(cwTitle, "HiCode · HIC 本地开发环境 v3.66" + edKey + "（" + ed.name + "）");
  html = html.replace("网页端在线开发", "本地离线开发");

  return html;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

Object.keys(EDITIONS).forEach(function (edKey) {
  const html = buildEdition(edKey);
  const OUT_FILE = path.join(OUT_DIR, "HiCode-v3.66" + edKey + "-offline.html");
  if (/<script src=|<link rel="stylesheet" href=/.test(html)) {
    console.error("⚠ " + edKey + " 仍有未内联的外部资源，请检查替换规则");
    process.exit(1);
  }
  fs.writeFileSync(OUT_FILE, html, "utf8");
  console.log("✓ 已生成 " + EDITIONS[edKey].name + " 离线单文件：" + path.relative(ROOT, OUT_FILE) + "（" + EDITIONS[edKey].note + "）");
  console.log("  大小：" + (html.length / 1024).toFixed(1) + " KB / " + html.length + " 字符");
});