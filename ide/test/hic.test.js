const HC = require("./js/hic.js");

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

// ---- 8. ZIP ----
const entries = HC.buildZipEntries([proj]);
ok(entries.length === 2, "zip有2个页面文件");
const z = HC.zipFiles(entries.map(e => ({ name: e.name, data: e.html })));
ok(z instanceof Uint8Array && z.length > 30, "zip字节生成");
// 校验 PK 头
ok(z[0] === 0x50 && z[1] === 0x4b, "zip魔数PK");

console.log("\n通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail ? 1 : 0);