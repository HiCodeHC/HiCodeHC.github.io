// 打包三档 exe（Windows portable）。用法：node pack-exe.js
// 前序：在 ./pkg/exe 下 npm install（见 dev-deps）
// 思路：三档复用同一份 node_modules；每档一个构建目录，放入对应离线单文件作为 index.html，
//       并写入带独立 productName 的 package.json，逐一用 electron-builder 构建。
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.env.HICODE_SITE || "/workspace/hicodehc-site"; // 仓库根
const OFF = path.join(ROOT, "download");            // 离线单文件目录
const MAIN = path.resolve(__dirname, "electron", "main.js");
const OUT = path.resolve(__dirname, "out");
const EDITIONS = [
  { key: "M", label: "M·轻量版", file: "HiCode-v3.66M-offline.html" },
  { key: "R", label: "R·标准版", file: "HiCode-v3.66R-offline.html" },
  { key: "X", label: "X·全能版", file: "HiCode-v3.66X-offline.html" }
];

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "dist-M"), { recursive: true });
fs.mkdirSync(path.join(OUT, "dist-R"), { recursive: true });
fs.mkdirSync(path.join(OUT, "dist-X"), { recursive: true });

const sharedNM = path.join(OUT, "node_modules");

function buildDir(ed) {
  const dir = path.join(OUT, "build-" + ed.key);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(MAIN, path.join(dir, "main.js"));
  const src = path.join(OFF, ed.file);
  if (!fs.existsSync(src)) { console.error("缺少离线单文件：" + ed.file); process.exit(1); }
  fs.copyFileSync(src, path.join(dir, "index.html"));
  return dir;
}

// 一次安装依赖
if (!fs.existsSync(path.join(sharedNM, "electron"))) {
  const basePkg = {
    name: "hicode-desktop-build",
    version: "3.66.0",
    private: true,
    devDependencies: {
      electron: "^31.7.7",
      "electron-builder": "^24.13.3"
    }
  };
  fs.writeFileSync(path.join(OUT, "package.json"), JSON.stringify(basePkg, null, 2));
  console.log("安装 electron / electron-builder 依赖（首次较久）…");
  execSync("cd " + OUT + " && npm install --no-audit --no-fund", { stdio: "inherit" });
}

for (const ed of EDITIONS) {
  const dir = buildDir(ed);
  try { fs.symlinkSync(sharedNM, path.join(dir, "node_modules"), "dir"); }
  catch (e) { /* 已存在忽略 */ }
  const pkg = {
    name: "hicode-desktop-" + ed.key.toLowerCase(),
    version: "3.66.0",
    description: "HiCode (HIC) 本地开发环境 " + ed.label,
    main: "main.js",
    author: "hicodehc",
    license: "MIT",
    build: {
      appId: "com.hicode.desktop." + ed.key.toLowerCase(),
      productName: "HiCode-v3.66" + ed.key,
      files: ["main.js", "index.html", "package.json"],
      directories: { output: path.join(OUT, "dist-" + ed.key) },
      win: {
        target: ["portable"],
        signAndEditExecutable: false // 无证书不签名/不注入版本信息，避免拉取 winCodeSign（免 wine）
      },
      portable: {},
      asar: false,
      electronDownload: { mirror: "https://npmmirror.com/mirrors/electron/" }
    }
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  console.log("▶ 构建 " + ed.label + " exe …");
  execSync("cd " + dir + " && npx electron-builder --win portable --x64 --publish never", { stdio: "inherit" });
  console.log("✓ " + ed.label + " exe 完成。");
}

console.log("\n产物位于 " + OUT + "/dist-{M,R,X}/");
for (const ed of EDITIONS) {
  const d = path.join(OUT, "dist-" + ed.key);
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) console.log("  " + ed.key + " → " + f + "（" + (fs.statSync(path.join(d, f)).size / 1048576).toFixed(1) + " MB）");
}