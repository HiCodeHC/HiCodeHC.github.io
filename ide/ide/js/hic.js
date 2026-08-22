/* ============================================================
 * HC v0.01 —— HIC 语言引擎
 * 负责：HIC 词法/语法解析、HIC→HTML 转译、轻量 ZIP 写入、下载
 * 说明：本文件为纯逻辑，不依赖 DOM(localStorage/document)，
 *       唯一例外是 download()（仅浏览器调用）；可用 Node 单元测试。
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HC = api;
})(typeof self !== 'undefined' ? self : null, function () {
  "use strict";

  const APP = { version: "v0.01", name: "HiCode", lang: "HIC" };

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function isName(s) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s); }
  const PY_TYPES = ["int", "float", "str", "bool", "list", "dict", "tuple"];

  /* ---------------- 词法：表达式求值（安全，无 eval） ---------------- */
  function tokenize(expr) {
    const out = []; let i = 0; const n = expr.length;
    while (i < n) {
      const c = expr[i];
      if (c === " " || c === "\t") { i++; continue; }
      if (c === "(") { out.push({ t: "(", v: c }); i++; continue; }
      if (c === ")") { out.push({ t: ")", v: c }); i++; continue; }
      if (c === "+") { out.push({ t: "+", v: c }); i++; continue; }
      const two = expr.substr(i, 2);
      if (two === "==" || two === "!=" || two === "<=" || two === ">=") { out.push({ t: two, v: two }); i += 2; continue; }
      if (c === "<" || c === ">") { out.push({ t: c, v: c }); i++; continue; }
      if (c === '"' || c === "'") {
        const q = c; let j = i + 1, s = "";
        while (j < n && expr[j] !== q) { s += expr[j]; j++; }
        out.push({ t: "str", v: s }); i = Math.min(j + 1, n); continue;
      }
      if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(expr[i + 1]))) {
        let j = i; let num = "";
        while (j < n && /[0-9._]/.test(expr[j])) { num += expr[j]; j++; }
        out.push({ t: "num", v: Number(num.replace(/[^0-9.]/g, "")) }); i = j; continue;
      }
      if (/[A-Za-z_0-9]/.test(c)) {
        let j = i; let w = "";
        while (j < n && /[A-Za-z0-9_]/.test(expr[j])) { w += expr[j]; j++; }
        out.push({ t: (["and", "or", "not", "in"].indexOf(w) >= 0 ? w : "id"), v: w });
        i = j; continue;
      }
      i++; // 跳过未知字符
    }
    return out;
  }

  function isNum(v) { return typeof v === "number"; }

  function applyCmp(op, l, r) {
    const numL = isNum(l), numR = isNum(r);
    const sL = String(l), sR = String(r);
    if (op === "==") return numL && numR ? l === r : sL === sR;
    if (op === "!=") return numL && numR ? l !== r : sL !== sR;
    if (op === "in") return sR.indexOf(sL) >= 0; // 「x in container」：右侧含左侧
    const a = numL && numR ? l : sL;
    const b = numL && numR ? r : sR;
    if (op === "<") return a < b;
    if (op === ">") return a > b;
    if (op === "<=") return a <= b;
    if (op === ">=") return a >= b;
    return false;
  }

  function evalExpr(expr, vars) {
    const toks = tokenize(expr);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    function truthy(v) {
      if (v === true) return true;
      if (v === false) return false;
      if (typeof v === "number") return v !== 0;
      return String(v).length > 0;
    }
    function primary() {
      const t = next();
      if (!t) return "";
      if (t.t === "(") { const v = orExpr(); next(); return v; }
      if (t.t === "num") return t.v;
      if (t.t === "str") return t.v;
      if (t.t === "id") {
        const w = t.v;
        if (w === "true") return true;
        if (w === "false") return false;
        if (w === "None") return "";
        if (Object.prototype.hasOwnProperty.call(vars, w)) return vars[w].value;
        return ""; // 未知裸标识符当空串处理（v0.01 约定）
      }
      return "";
    }
    function factor() { return primary(); }
    function term() {
      let v = factor();
      while (peek() && peek().t === "+") { next(); v = Number(v) + Number(factor()); }
      return v;
    }
    function cmp() {
      let l = term();
      while (peek() && ["==", "!=", "<", ">", "<=", ">=", "in"].indexOf(peek().t) >= 0) {
        const op = next().t; const r = term(); l = applyCmp(op, l, r);
      }
      return l;
    }
    function notExpr() { if (peek() && peek().t === "not") { next(); return !truthy(notExpr()); } return cmp(); }
    function andExpr() { let v = notExpr(); while (peek() && peek().t === "and") { next(); v = truthy(v) && truthy(notExpr()); } return v; }
    function orExpr() { let v = andExpr(); while (peek() && peek().t === "or") { next(); v = truthy(v) || truthy(andExpr()); } return v; }
    try { return truthy(orExpr()); } catch (e) { return false; }
  }

  /* ---------------- 判断头解析 ---------------- */
  function parseCondHeader(line) {
    // 返回 {type:'if'|'orif'|'noif', cond}
    if (/^noif\b/.test(line)) return { type: "noif" };
    const m = line.match(/^((?:orif)|(?:if))\s+(.+?)\s*$/);
    if (m) return { type: m[1], cond: m[2].replace(/:\s*$/, "").trim() };
    if (line === "if" || line === "orif") return { type: line, cond: "" };
    return null;
  }

  function isCondHeader(line) {
    return /^(if|orif|noif)\b/.test(line);
  }

  /* ---------------- 语句分类 ---------------- */
  function classify(line) {
    // 返回 {kind, ...}
    if (!line || line.trim() === "" ) return { kind: "blank" };
    // it 变量声明
    const itm = line.match(/^it\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+([A-Za-z0-9_]+))?(?:\s+(.*))?$/);
    if (itm) {
      const name = itm[1];
      let type = itm[2] || "";
      let value = (itm[3] || "").trim();
      // p 类型：忽略后续值；t：字符串；其余(Python 原语/留空)：普通
      let kind;
      if (type === "p") { kind = "img"; value = ""; }
      else if (type === "t") { kind = "text"; }
      else { kind = "ordinary"; }
      if (type !== "t" && type !== "p" && type) type = "ordinary"; // int/str... 归普通
      return { kind: "it", name, vtype: kind, type, value };
    }
    // in 展示：name in t / name in p   （坐标在本版本不启用，默认居中）
    const inm = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(t|p|text|img)\b/i);
    if (inm) {
      const mode = inm[2].toLowerCase();
      return { kind: "in", name: inm[1], mode: (mode === "p" || mode === "img") ? "img" : "text" };
    }
    const cond = parseCondHeader(line);
    if (cond) return { kind: "cond", ...cond };
    // 导向 to / fr
    const nav = parseNav(line);
    if (nav) return { kind: "nav", ...nav };
    // 其余作为纯文本行（保留，转译为段落）
    return { kind: "textline", text: line };
  }

  function parseNav(line) {
    // 拆词（按空白，忽略多余空白）
    const toks = line.split(/\s+/).filter(Boolean);
    if (toks.indexOf("to") < 0) return null;
    const ti = toks.indexOf("to");
    const left = toks.slice(0, ti);
    const right = toks.slice(ti + 1);
    const isFR = left[0] === "fr";
    const cleft = isFR ? left.slice(1) : left;
    let node;
    if (cleft.length >= 2 && right.length >= 2) {
      // 跨项目：projFrom pageFrom → projTo pageTo
      const fromProj = cleft.slice(0, cleft.length - 1).join(" ");
      const fromPage = cleft[cleft.length - 1];
      const toProj = right.slice(0, right.length - 1).join(" ");
      const toPage = right[right.length - 1];
      node = { cross: true, fromProj, fromPage, toProj, toPage, isFR: !!isFR };
    } else if (cleft.length === 1 && right.length === 1) {
      // 同项目显式来源：fromPage to toPage
      node = { cross: false, fromPage: cleft[0], toPage: right[0] };
    } else {
      // toPage（来源为当前页）
      node = { cross: false, fromPage: null, toPage: right[0] || "" };
    }
    return node;
  }

  /* ---------------- 缩进块解析 ---------------- */
  function parse(code) {
    const ls = String(code || "").split("\n").map(function (raw) {
      const mt = raw.match(/^[ \t]*/)[0];
      return { indent: mt.replace(/\t/g, "  ").length, line: raw.slice(mt.length).trim() };
    }).filter(function (x) { return x.line && !x.line.startsWith("#"); });

    // 取 [start,end) 范围内行缩进的最小值（子块的实际根缩进）
    function minIndent(start, end) {
      let m = Infinity;
      for (let k = start; k < end; k++) { if (ls[k].indent < m) m = ls[k].indent; }
      return m === Infinity ? -1 : m;
    }
    // 绑定链式条件：把同一缩进的 orif/noif 并入其前的 if/orif
    // 子块层级不依赖「恰好 indentGoal+1」，而以子块实际首行缩进为准，兼容任意缩进深度
    function build(start, end, indentGoal) {
      const out = [];
      let i = start;
      let pendingIf = null;
      while (i < end) {
        const cur = ls[i];
        if (cur.indent < indentGoal) break;          // 退回上层
        if (cur.indent > indentGoal) { i++; continue; } // 更深缩进由父层子块统一处理
        const st = classify(cur.line);
        if (st.kind === "cond" && st.type === "if") {
          if (pendingIf) out.push(pendingIf);
          pendingIf = { kind: "cond", cond: st.cond, body: [], chains: [] };
          i++;
          const bodyEnd = collectUntil(i, end, indentGoal);
          pendingIf.body = build(i, bodyEnd, minIndent(i, bodyEnd));
          i = bodyEnd;
        } else if (st.kind === "cond" && (st.type === "orif" || st.type === "noif")) {
          const isElse = st.type === "noif";
          i++;
          const bodyEndElse = collectUntil(i, end, indentGoal);
          const sub = build(i, bodyEndElse, minIndent(i, bodyEndElse));
          if (pendingIf) {
            pendingIf.chains.push({ orif: isElse ? null : st.cond, else: isElse, body: sub });
          } else {
            out.push({ kind: "cond", cond: null, body: sub, chains: [], orphan: isElse ? "else" : "orif" });
          }
          i = bodyEndElse;
        } else {
          if (pendingIf) { out.push(pendingIf); pendingIf = null; }
          out.push(st);
          i++;
        }
      }
      if (pendingIf) out.push(pendingIf);
      return out;
    }
    function collectUntil(i, end, indentGoal) {
      while (i < end && ls[i].indent > indentGoal) i++;
      return i;
    }
    return build(0, ls.length, 0);
  }

  /* ---------------- 语义：提取变量 + 渲染 ---------------- */
  function collectVars(nodes, vars) {
    nodes.forEach(function (n) {
      if (n.kind === "it") {
        if (!vars[n.name]) {
          vars[n.name] = { type: n.vtype || "ordinary", value: n.value || "", isImg: (n.vtype === "img") };
        }
      } else if (n.kind === "cond") {
        collectVars(n.body, vars);
        n.chains.forEach(function (c) { collectVars(c.body, vars); });
        if (n.orphan) { /* orphan body already collected */ }
      }
    });
    return vars;
  }

  function renderNodes(nodes, vars, ctx, out) {
    nodes.forEach(function (n) {
      if (n.kind === "it") {
        out.push(n); // 声明保留（供变量面板）
      } else if (n.kind === "in") {
        const v = vars[n.name];
        if (!v) return;
        out.push({ kind: "display", name: n.name, mode: n.mode, value: v.value });
      } else if (n.kind === "nav") {
        out.push({ kind: "nav", ...n });
      } else if (n.kind === "cond") {
        // 求值 if；未匹配则依次 orif；都不匹配取 else
        let chosen = null;
        if (n.cond != null) {
          try { if (evalExpr(n.cond, vars)) chosen = n.body; } catch (e) {}
        }
        if (!chosen) {
          for (let k = 0; k < n.chains.length; k++) {
            const c = n.chains[k];
            if (c.else) { chosen = c.body; break; }
            try { if (evalExpr(c.orif, vars)) { chosen = c.body; break; } } catch (e) {}
          }
        }
        if (chosen) renderNodes(chosen, vars, ctx, out);
      } else if (n.kind === "textline") {
        out.push({ kind: "textline", text: n.text });
      }
    });
    return out;
  }

  function processPage(page, allProjects) {
    // 返回 {vars, items}
    const nodes = parse(page.code);
    const vars = collectVars(nodes, {});
    // 绑定图片
    Object.keys(vars).forEach(function (k) {
      if (vars[k].isImg) vars[k].value = (page.images && page.images[k]) || "";
    });
    const items = renderNodes(nodes, vars, {}, []);
    return { vars, items };
  }

  /* ---------------- HTML 生成 ---------------- */
  const PAGE_CSS = [
    "*{box-sizing:border-box;margin:0;padding:0;}",
    "body{font-family:-apple-system,'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif;background:#1a1510;color:#f2e9da;line-height:1.7;}",
    ".hic-page{min-height:100vh;}",
    ".hic-bar{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 18px;",
    " background:rgba(255,252,244,.08);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,230,190,.16);}",
    ".hic-bar .t{font-weight:700;margin-right:auto;color:#d9ae6b;}",
    ".hic-bar button,.hic-bar a{padding:7px 14px;border-radius:999px;border:1px solid rgba(255,230,190,.25);",
    " background:transparent;color:#f2e9da;cursor:pointer;text-decoration:none;font-size:13px;}",
    ".hic-bar button:hover,.hic-bar a:hover{border-color:#d9ae6b;color:#d9ae6b;}",
    ".hic-bar .on{border-color:#d9ae6b;color:#15100b;background:#d9ae6b;font-weight:600;}",
    ".hic-item{max-width:860px;margin:40px auto;padding:0 20px;text-align:center;}",
    ".hic-text{font-size:42px;font-weight:800;letter-spacing:.5px;line-height:1.3;}",
    ".hic-sub{font-size:20px;color:#cbb995;margin-top:8px;}",
    ".hic-link{margin-top:14px;font-size:14px;color:#8d7f63;}",
    ".hic-imgwrap{max-width:860px;margin:40px auto;padding:0 20px;text-align:center;}",
    ".hic-img{max-width:100%;max-height:70vh;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.4);}",
    ".hic-void{opacity:.4;}",
    ".hic-navrow{margin-top:34px;}",
    "@media(max-width:700px){.hic-text{font-size:32px;}}"
  ].join("\n");

  function pageSlug(p) { return (p && p.name) ? p.name : "page"; }

  function renderItems(items, ctx) {
    // ctx: { page, pageKey, pageNames[], projects[], single, mode }
    return items.map(function (it) {
      if (it.kind === "display" && it.mode === "text") {
        return '<p class="hic-item hic-text">' + esc(it.value) + "</p>";
      }
      if (it.kind === "display" && it.mode === "img") {
        const src = it.value ? esc(it.value) : "";
        return '<div class="hic-item hic-imgwrap"><img class="hic-img' + (src ? "" : " hic-void") + '" src="' + src +
          '" alt="' + esc(it.name) + '"' + (src ? "" : " onerror=\"this.classList.add('hic-void')\"") + "></div>";
      }
      if (it.kind === "nav") {
        const href = navHref(it, ctx);
        const label = (it.cross ? "跨项目 " : "") + (it.toPage || it.toProj || "");
        const disabled = href && href.kind === "disabled";
        if (disabled) {
          return '<div class="hic-item hic-navrow"><span class="hic-link">前往「' + esc(it.toPage) + "」页面（导出包内暂未包含，需一并导出）</span></div>";
        }
        const h = href.href || "#";
        return '<div class="hic-item hic-navrow"><a class="hic-link" href="' + esc(h) + '"' +
          (href.sameDoc ? ' data-hc-goto="' + esc(href.pageKey) + '"' : "") + ">前往 " + esc(href.label || label) + " 页面 →</a></div>";
      }
      if (it.kind === "textline") {
        return '<p class="hic-item hic-sub">' + esc(it.text) + "</p>";
      }
      return "";
    }).join("\n");
  }

  function navHref(it, ctx) {
    // ctx: { mode, projName, pageName, projOf }
    const pmap = ctx.projectsMap || {};
    if (!it.cross) {
      // 同项目内：目标页面在同项目
      const targetPage = it.toPage;
      if (ctx.mode === "zip" || ctx.mode === "singlepage") {
        const fn = ctx.projSlug + "-" + slugify(targetPage) + ".html";
        return { href: fn, label: targetPage };
      }
      // 合并单 html：跳转同文档内区块
      const key = ctx.projSlug + "::" + targetPage;
      return { href: "#" + key, sameDoc: true, pageKey: key, label: targetPage };
    }
    // 跨项目
    if (ctx.mode === "zip") {
      return { href: slugify(it.toProj) + "-" + slugify(it.toPage) + ".html", label: it.toProj + "·" + it.toPage };
    }
    // 合并：目标项目是否存在
    const found = pmap[it.toProj];
    if (found && found.pages[it.toPage]) {
      const key = found.slug + "::" + it.toPage;
      return { href: "#" + key, sameDoc: true, pageKey: key, label: it.toProj + "·" + it.toPage };
    }
    return { kind: "disabled" };
  }

  function slugify(s) { return String(s || "").replace(/[^\w\u4e00-\u9fa5-]+/g, "-"); }

  function pageShell(inner, opts) {
    const title = opts.title || "HiCode 页面";
    return [
      "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n",
      "<meta charset=\"UTF-8\">\n",
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n',
      "<title>", esc(title), "</title>\n",
      "<style>\n", PAGE_CSS, "\n</style>\n</head>\n<body>\n", inner, "\n",
      "<script>", opts.navJs || "", "<\/script>\n</body>\n</html>"
    ].join("");
  }

  function pageJsBlock(pageTabs) {
    const js =
      "(function(){var tabs=document.querySelectorAll('.hic-bar button');var pages=document.querySelectorAll('.hic-page');" +
      "function go(k){pages.forEach(function(p){p.style.display=p.dataset.page===k?'':'none';});" +
      "tabs.forEach(function(b){b.classList.toggle('on',b.dataset.goto===k);});window.scrollTo(0,0);}" +
      "tabs.forEach(function(b){b.addEventListener('click',function(){go(b.dataset.goto);});});" +
      "document.querySelectorAll('[data-hc-goto]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();go(a.getAttribute('data-hc-goto'));});});" +
      "var first=document.querySelector('.hic-page');var all=document.querySelectorAll('.hic-page');" +
      "if(all.length>0){var active=(first&&first.dataset.page)||'';go(active);}" +
      "})();";
    return js;
  }

  /* ---- 顶层导出入口 ---- */
  // pageObj: {id,name,code,images}
  function buildSinglePageHtml(project, page) {
    const { items } = processPage(page, {});
    const projSlug = slugify(project.name);
    const inner = '<div class="hic-page" data-page="' + esc(page.name) + '">\n' + renderItems(items, {
      mode: "singlepage", projSlug, projName: project.name, pageName: page.name,
      projectsMap: null
    }) + "\n</div>";
    const navBar = ['<div class="hic-bar"><span class="t">', esc(project.name + " · " + page.name), "</span></div>"].join("");
    return pageShell(navBar + inner, { title: project.name + " - " + page.name });
  }

  function buildProjectMergedHtml(project, projectsMap) {
    const pages = Object.values(project.pages);
    const projSlug = slugify(project.name);
    const ctxBase = { mode: "merged", projSlug, projName: project.name, projectsMap };
    const navBar = ['<div class="hic-bar"><span class="t">', esc(project.name), "</span>",
      ...pages.map(function (p, i) {
        return '<button data-goto="' + esc(projSlug + "::" + p.name) + '"' + (i === 0 ? "" : "") + ">" + esc(p.name) + "</button>";
      }), "</div>"].join("");
    const sections = pages.map(function (p) {
      const { items } = processPage(p, {});
      const ctx = { ...ctxBase, pageName: p.name, mode: "merged" };
      return '<section class="hic-page" data-page="' + esc(projSlug + "::" + p.name) + '">\n' + renderItems(items, ctx) + "\n</section>";
    }).join("\n");
    const js = pageJsBlock(null);
    return pageShell(navBar + sections, { title: project.name, navJs: js });
  }

  // 多项目多页面合并成一个 html（用于「多个项目统一导出」），支持同项目与原跨项目跳转
  function buildAllMergedHtml(projects, projectsMap) {
    const allPages = [];
    projects.forEach(function (proj) {
      Object.values(proj.pages).forEach(function (pg) { allPages.push({ proj: proj, page: pg }); });
    });
    const navBar = ['<div class="hic-bar"><span class="t">HiCode · ', esc(String(projects.length)), " 项目</span>",
      ...allPages.map(function (ob) {
        return '<button data-goto="' + esc(slugify(ob.proj.name) + "::" + ob.page.name) + '">' + esc(ob.proj.name + " · " + ob.page.name) + "</button>";
      }), "</div>"].join("");
    const sections = allPages.map(function (ob) {
      const { items } = processPage(ob.page, {});
      const ctx = { mode: "merged", projSlug: slugify(ob.proj.name), projName: ob.proj.name, pageName: ob.page.name, projectsMap: projectsMap || {} };
      return '<section class="hic-page" data-page="' + esc(slugify(ob.proj.name) + "::" + ob.page.name) + '">\n' + renderItems(items, ctx) + "\n</section>";
    }).join("\n");
    return pageShell(navBar + sections, { title: "HiCode 合并预览（" + projects.length + " 项目）", navJs: pageJsBlock(null) });
  }

  function buildZipEntries(projects) {
    // 返回 [{name, html}]，name = "{proj}-{page}.html"
    const arr = [];
    projects.forEach(function (proj) {
      Object.values(proj.pages).forEach(function (pg) {
        const { items } = processPage(pg, {});
        const ctx = { mode: "zip", projSlug: slugify(proj.name), projName: proj.name, pageName: pg.name, projectsMap: {} };
        const inner = '<div class="hic-page" data-page="' + esc(esc(pg.name)) + '">\n' + renderItems(items, ctx) + "\n</div>";
        const navBar = ['<div class="hic-bar"><span class="t">', esc(proj.name + " · " + pg.name), "</span></div>"].join("");
        arr.push({ name: slugify(proj.name) + "-" + slugify(pg.name) + ".html", html: pageShell(navBar + inner, { title: proj.name + " - " + pg.name }) });
      });
    });
    return arr;
  }

  /* ---- 轻量 ZIP（仅存储，无压缩） ---- */
  function crc32(buf) {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c; }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    // 尽量用 TextEncoder
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(data));
    const s = String(data); const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF;
    return b;
  }
  function zipFiles(files) {
    const parts = []; const central = []; let offset = 0;
    files.forEach(function (f) {
      const data = toBytes(f.data); const name = toBytes(f.name); const crc = crc32(data);
      const local = new Uint8Array(30 + name.length + data.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
      local.set(name, 30); local.set(data, 30 + name.length);
      central.push({ name, crc, size: data.length, offset });
      parts.push(local); offset += local.length;
    });
    const centralStart = offset;
    central.forEach(function (c) {
      const rec = new Uint8Array(46 + c.name.length); const dv = new DataView(rec.buffer);
      dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
      dv.setUint32(16, c.crc, true); dv.setUint32(20, c.size, true); dv.setUint32(24, c.size, true);
      dv.setUint16(28, c.name.length, true); dv.setUint32(42, c.offset, true);
      rec.set(c.name, 46); parts.push(rec);
    });
    const cdSize = central.reduce(function (s, c) { return s + 46 + c.name.length; }, 0);
    const eocd = new Uint8Array(22); const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); edv.setUint16(8, central.length, true); edv.setUint16(10, central.length, true);
    edv.setUint32(12, cdSize, true); edv.setUint32(16, centralStart, true);
    parts.push(eocd);
    const total = parts.reduce(function (s, p) { return s + p.length; }, 0);
    const out = new Uint8Array(total); let o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out; // 返回 Uint8Array；浏览器端转 Blob
  }
  function zipBlob(files) { return new Blob([zipFiles(files).buffer], { type: "application/zip" }); }

  function download(data, filename) {
    const blob = data instanceof Blob ? data : new Blob([String(data)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }

  return {
    APP, esc, isName, parse, classify, parseNav, processPage,
    buildSinglePageHtml, buildProjectMergedHtml, buildAllMergedHtml, buildZipEntries,
    zipFiles, zipBlob, download, evalExpr, slugify
  };
});