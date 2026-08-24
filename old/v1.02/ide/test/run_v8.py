# 用嵌入式 V8 (py_mini_racer) 执行 hic.js，并对结果做断言
import sys, io, json
from py_mini_racer import MiniRacer

with io.open(r"D:\hicode-ide\js\hic.js", "r", encoding="utf-8") as f:
    hic_src = f.read()

# 兼容 node 的 module.exports：py_mini_racer 无 module/window。
# 我们用无头 IIFE 风格：hic.js 里 `if (typeof module... ) module.exports`；此处模拟 module。
js_test = r"""
var __out = {};
var module = { exports: {} };
var _result = null;
""" + hic_src + r"""
var HC = module.exports;

var pass = 0, fail = 0, logs = [];
function ok(cond, label){ if(cond){pass++;} else {fail++; logs.push("F "+label);} }

// 1. 变量声明
var r = HC.classify("it title t 你好 HiCode");
ok(r.kind==="it" && r.name==="title" && r.vtype==="text" && r.value==="你好 HiCode", "it title t");
r = HC.classify("it logo p");
ok(r.kind==="it" && r.name==="logo" && r.vtype==="img" && r.value==="", "it logo p");
r = HC.classify("it age int 18");
ok(r.kind==="it" && r.name==="age" && r.vtype==="ordinary", "it age int ordinary");
r = HC.classify("it msg");
ok(r.kind==="it" && r.name==="msg" && r.vtype==="ordinary", "it msg ordinary");

// 2. in 展示
r = HC.classify("title in t");
ok(r.kind==="in" && r.mode==="text", "in t");
r = HC.classify("logo in p");
ok(r.kind==="in" && r.mode==="img", "in p");

// 3. 条件头
ok(HC.classify("if age == 18:").type==="if", "if头");
ok(HC.classify("orif age > 18:").type==="orif", "orif头");
ok(HC.classify("noif:").type==="noif", "noif头");

// 4. 表达式求值
ok(HC.evalExpr("age == 18", {age:{value:18}})===true, "数值比较");
ok(HC.evalExpr("1 == 1 and 2 > 1", {})===true, "and");
ok(HC.evalExpr("1 > 2 or 3 == 3", {})===true, "or");
ok(HC.evalExpr("not (1 == 2)", {})===true, "not");
ok(HC.evalExpr("'hello' in 'xxhello'", {})===true, "in子串");

// 5. 导向
r = HC.parseNav("home to about");
ok(r && !r.cross && r.toPage==="about", "同项目 x to y");
r = HC.parseNav("to about");
ok(r && !r.cross && r.toPage==="about", "to y");
r = HC.parseNav("fr 我的项目 首页 big to 我的项目 关于");
ok(r && r.cross && r.toProj==="我的项目", "fr 项目 页面 big to");

// 6. 端到端
var page = { name:"index", code: [
  "it title t 你好，HiCode",
  "it intro t 简单上手的编程语言",
  "it logo p",
  "it count int 3",
  "if count == 3:",
  "    intro in t",
  "noif:",
  "    title in t",
  "to about"
].join("\n"), images: { logo: "data:image/png;base64,AAAA" } };
var pr = HC.processPage(page, {});
ok(Object.keys(pr.vars).length===4, "4变量");
ok(pr.vars.logo.isImg && pr.vars.logo.value==="data:image/png;base64,AAAA", "p绑定图片");
var ts = pr.items.filter(function(x){return x.kind==="display" && x.mode==="text";});
ok(ts.length===1 && ts[0].value==="简单上手的编程语言", "if命中intro");
ok(pr.items.filter(function(x){return x.kind==="nav";}).length===1, "1导向");

// 7. HTML
var proj = { id:"p1", name:"我的项目", pages:{
  p_a:page, p_b:{ id:"p_b", name:"about", code:"it hello t 关于我们\nhello in t", images:{} } } };
var merged = HC.buildProjectMergedHtml(proj, {});
ok(merged.indexOf('data-page="我的项目::index"')>=0, "合并含index");
ok(merged.indexOf("简单上手的编程语言")>=0, "合并含文本");
ok(/<!DOCTYPE html>/i.test(merged), "HTML骨架");
var single = HC.buildSinglePageHtml({name:"我的项目"}, page);
ok(single.indexOf("简单上手")>=0 || single.indexOf("你好，HiCode")>=0, "单页html");

// 8. ZIP
var entries = HC.buildZipEntries([proj]);
ok(entries.length===2, "zip两页");
var z = HC.zipFiles(entries.map(function(e){return {name:e.name, data:e.html};}));
ok(z && z[0]===0x50 && z[1]===0x4b, "zip魔数PK");

__out = { pass: pass, fail: fail, logs: logs.slice(0,20) };
JSON.stringify(__out);
"""

res_json = MiniRacer().eval(js_test)
r = json.loads(res_json)
print("通过:", r["pass"], "失败:", r["fail"])
print("RESULT_JSON:", json.dumps(r, ensure_ascii=False))
for l in r["logs"]:
    print("  ", l)
sys.exit(1 if r["fail"] else 0)