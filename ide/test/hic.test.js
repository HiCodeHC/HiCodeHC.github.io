const HC = require("../js/hic.js");

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + label); } }

// ---- 1. 变量声明解析 ----
let r = HC.classify("it title t 你好 HiCode");
ok(r.kind === "it" && r.name === "title" && r.vtype === "text" && r.value === "你好 HiCode", "it title t");

r = HC.classify("it logo p");
ok(r.kind === "it" && r.name === "logo" && r.vtype === "img" && r.value === "", "it logo p");

r = HC.classify("it age int 18");
ok(r.kind === "it" && r.name === "age" && r.vtype === "ordinary", "it age int -> ordinary");

r = HC.classify("it msg");
ok(r.kind === "it" && r.name === "msg" && r.vtype === "ordinary", "it msg -> ordinary");

// ---- 2. in 展示 ----
r = HC.classify("title in t");
ok(r.kind === "in" && r.mode === "text", "in t");
r = HC.classify("logo in p");
ok(r.kind === "in" && r.mode === "img", "in p");

// ---- 3. 条件头 ----
ok(HC.classify("if age == 18:").type === "if", "if头");
ok(HC.classify("orif age > 18:").type === "orif", "orif头");
ok(HC.classify("noif:").type === "noif", "noif头");

// ---- 4. 表达式求值 ----
ok(HC.evalExpr("age == 18", { age: { value: 18 } }) === true, "数值比较");
ok(HC.evalExpr("1 == 1 and 2 > 1", {}) === true, "and");
ok(HC.evalExpr("1 > 2 or 3 == 3", {}) === true, "or");
ok(HC.evalExpr("not (1 == 2)", {}) === true, "not");
ok(HC.evalExpr("'hello' in 'xxhello'", {}) === true, "in子串");

// ---- 5. 导向解析 ----
r = HC.parseNav("home to about");
ok(r && !r.cross && r.fromPage === "home" && r.toPage === "about", "同项目 x to y");
r = HC.parseNav("to about");
ok(r && !r.cross && r.fromPage === null && r.toPage === "about", "to y(当前页)");
r = HC.parseNav("fr 我的项目 首页 big to 我的项目 关于");
ok(r && r.cross && r.toProj === "我的项目", "跨项目 fr 项目 页面 big to");

// ---- 6. 端到端：解析+语义 -> 元素 ----
const page = {
  name: "index",
  code: [
    "it title t 你好，HiCode",
    "it intro t 简单上手的编程语言",
    "it logo p",
    "it count int 3",
    "if count == 3:",
    "    intro in t",
    "noif:",
    "    title in t",
    "to about"
  ].join("\n"),
  images: { logo: "data:image/png;base64,AAAA" }
};
const { vars, items } = HC.processPage(page, {});
ok(Object.keys(vars).length === 4, "收集到4个变量");
ok(vars.logo.isImg === true && vars.logo.value === "data:image/png;base64,AAAA", "p变量绑定图片");
const texts = items.filter(x => x.kind === "display" && x.mode === "text");
ok(texts.length === 1 && texts[0].value === "简单上手的编程语言", "if分支命中 intro(非 title)");
const navs = items.filter(x => x.kind === "nav");
ok(navs.length === 1 && navs[0].toPage === "about", "存在一个 to 导向");

// ---- 7. HTML 生成 ----
const proj = { id: "p1", name: "我的项目", pages: { p_a: page, p_b: { id: "p_b", name: "about", code: "it hello t 关于我们\nhello in t", images: {} } } };
const merged = HC.buildProjectMergedHtml(proj, {});
ok(merged.indexOf("data-page=\"我的项目::index\"") >= 0, "合并含 index 区块");
ok(merged.indexOf("我的项目::about") >= 0, "合并含 about 区块");
ok(merged.indexOf("简单上手的编程语言") >= 0, "合并含文本内容");
ok(/<!DOCTYPE html>/i.test(merged), "含 HTML 骨架");

const single = HC.buildSinglePageHtml({ name: "我的项目" }, page);
ok(single.indexOf("你好，HiCode") >= 0 || single.indexOf("简单上手") >= 0, "单页html含内容");
ok(single.indexOf("我的项目-about.html") < 0 && single.indexOf("导出包内暂未包含") >= 0, "单页导出禁用跳转避免404");

// ---- 8. ZIP ----
const entries = HC.buildZipEntries([proj]);
ok(entries.length === 2, "zip有2个页面文件");
const z = HC.zipFiles(entries.map(e => ({ name: e.name, data: e.html })));
ok(z instanceof Uint8Array && z.length > 30, "zip字节生成");
// 校验 PK 头
ok(z[0] === 0x50 && z[1] === 0x4b, "zip魔数PK");

// ---- 9. v0.02 中文变量名 ----
r = HC.classify("it 标题 t 你好世界");
ok(r.kind === "it" && r.name === "标题" && r.vtype === "text" && r.value === "你好世界", "中文变量名 it");
r = HC.classify("标题 in t");
ok(r.kind === "in" && r.name === "标题" && r.mode === "text", "中文变量名 in t");
r = HC.classify("it 用户年龄 int 18");
ok(r.kind === "it" && r.name === "用户年龄" && r.vtype === "ordinary", "中文变量名 it int");

// ---- 10. v0.02 四则运算 / 优先级 / 一元负号 ----
ok(HC.evalExpr("2 + 3 * 4", {}) === 14, "乘法优先级高于加法");
ok(HC.evalExpr("(2 + 3) * 4", {}) === 20, "括号改变优先级");
ok(HC.evalExpr("10 % 3", {}) === 1, "取模 %");
ok(HC.evalExpr("2.5 * 2", {}) === 5, "浮点乘法");
ok(HC.evalExpr("-5 + 3", {}) === -2, "一元负号");
ok(HC.evalExpr("10 - 2 - 3", {}) === 5, "连续减法");
ok(HC.evalExpr("x + 2 == 20", { x: { value: 18 } }) === true, "变量参与算术");
ok(HC.evalExpr("x > 10", { x: { value: 3 } }) === false, "数值比较(多位)");
ok(HC.evalExpr("x > 10", { x: { value: 30 } }) === true, "数值比较(多位)2");

// ---- 11. v0.02 展示样式分级 + 链接 + 数值变量 ----
const p2 = {
  name: "demo",
  code: [
    "it 标题 t 你好世界",
    "it 副标题 t 这是副标题",
    "it 正文 t 这是一段正文内容",
    "it 链接 t https://example.com",
    "it 数量 int 18",
    "标题 in t",
    "副标题 in s",
    "正文 in b",
    "链接 in link",
    "if 数量 + 2 == 20:",
    "    标题 in t"
  ].join("\n"),
  images: {}
};
const r2 = HC.processPage(p2, {});
ok(Object.keys(r2.vars).length === 5, "中文变量收集到5个");
ok(r2.vars["标题"].value === "你好世界", "中文变量名取值");
ok(typeof r2.vars["数量"].value === "number" && r2.vars["数量"].value === 18, "数值变量存为 number");
const displayModes = r2.items.filter(x => x.kind === "display").map(x => x.mode);
ok(displayModes.indexOf("sub") >= 0, "sub 副标题模式");
ok(displayModes.indexOf("body") >= 0, "body 正文模式");
ok(displayModes.indexOf("link") >= 0, "link 链接模式");
const built = HC.buildSinglePageHtml({ name: "demo" }, p2);
ok(built.indexOf('class="hic-href"') >= 0, "链接渲染含 hic-href");
ok(built.indexOf("hic-sub") >= 0, "副标题渲染含 hic-sub");

// ---- 12. v0.026 人性化编译：单等号 + 全角/数学运算符 ----
ok(HC.evalExpr("age = 18", { age: { value: 18 } }) === true, "单等号 = 当作 == 比较");
ok(HC.evalExpr("age = 19", { age: { value: 18 } }) === false, "单等号 = 比较为假");
ok(HC.evalExpr("2 \uFF0B 3", {}) === 5, "全角加 ＋");
ok(HC.evalExpr("6 \u00F7 2", {}) === 3, "除号 ÷");
ok(HC.evalExpr("3 \u00D7 4", {}) === 12, "乘号 ×");
ok(HC.evalExpr("10 \uFF0D 4", {}) === 6, "全角减 －");
ok(HC.evalExpr("10 \u2212 4", {}) === 6, "数学减号 −");
ok(HC.evalExpr("10 \uFF05 3", {}) === 1, "全角百分号 ％");
ok(HC.evalExpr("3 \u2265 3", {}) === true, "≥ 当作 >=");
ok(HC.evalExpr("2 \u2264 3", {}) === true, "≤ 当作 <=");
ok(HC.evalExpr("2 \u2260 3", {}) === true, "≠ 当作 !=");
ok(HC.evalExpr("\uFF082 \uFF0B 3\uFF09\u00D7 4", {}) === 20, "全角括号与混合运算符");
ok(HC.evalExpr("年龄 = 18", { "年龄": { value: 18 } }) === true, "中文变量 + 单等号");

// ---- 13. v0.026 代码备注（# 整行 / 行尾注释）----
const p3 = HC.processPage({
  name: "note",
  code: [
    "# 这是整行备注",
    "it 标题 t 你好世界",
    "it 简介 t 这是简介 # 行尾备注",
    "标题 in t # 这里的备注被忽略",
    "简介 in s"
  ].join("\n"),
  images: {}
}, {});
ok(Object.keys(p3.vars).length === 2, "备注行被忽略，只收集 2 个变量");
ok(p3.vars["简介"].value === "这是简介", "行尾备注不影响取值");
ok(p3.items.some(function (it) { return it.kind === "display" && it.value === "你好世界"; }), "带行尾备注的 in 语句仍正常渲染");
ok(p3.items.some(function (it) { return it.kind === "display" && it.value === "这是简介"; }), "行尾备注不影响展示值");
// URL 片段中的 # 不应被当作备注
const p4 = HC.processPage({ name: "link", code: "it 链接 t https://example.com/#/home\n链接 in link", images: {} }, {});
ok(p4.vars["链接"].value === "https://example.com/#/home", "URL 中的 # 不被当作备注");

console.log("\n通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail ? 1 : 0);