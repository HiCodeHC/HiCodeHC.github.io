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
const IDE = path.join(ROOT, "ide");
const OUT_DIR = path.join(ROOT, "download");
const OUT_FILE = path.join(OUT_DIR, "HiCode-ide-offline.html");

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

/* 3) 脚本内联（顺序：store → hic → app）
   注意：用「函数替换」而非字符串替换，避免源码中的 $& 等被当作
   正则在替换串中的特殊模式（app.js 的 \"\\$&\" 会触发此问题）。 */
function inlineFile(src) {
  return "<script>\n" + fs.readFileSync(path.join(IDE, "js", src), "utf8") + "\n</script>";
}
html = html
  .replace('<script src="js/store.js"></script>', function () { return inlineFile("store.js"); })
  .replace('<script src="js/hic.js"></script>', function () { return inlineFile("hic.js"); })
  .replace('<script src="js/app.js"></script>', function () { return inlineFile("app.js"); });

/* 4) 文案标记为「本地版」 */
html = html.replace(
  "<title>HiCode · 在线开发环境 v1.00</title>",
  "<title>HiCode · 本地开发环境 v1.00</title>"
);
html = html.replace("v1.00 · 网页端", "v1.00 · 本地版");
html = html.replace("HIC 语言在线开发", "HIC 语言本地开发");
html = html.replace("网页端在线开发", "本地离线开发");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (/<script src=|<link rel="stylesheet" href=/.test(html)) {
  console.error("⚠ 仍有未内联的外部资源，请检查替换规则");
  process.exit(1);
}
fs.writeFileSync(OUT_FILE, html, "utf8");
console.log("✓ 已生成离线单文件：" + path.relative(ROOT, OUT_FILE));
console.log("  大小：" + (html.length / 1024).toFixed(1) + " KB / " + html.length + " 字符");