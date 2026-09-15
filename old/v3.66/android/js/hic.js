/* ============================================================
 * HC v3.01 —— HIC 语言引擎
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

  const APP = { version: "v3.66", name: "HiCode", lang: "HIC" };
  // 当前发布形态：r=标准(+py) / m=轻量(仅hic) / x=全能(+py+cpp)。
  // 导出的 HTML 会在 head 写入 window.HIC_EDITION，由内建编译器宿主据此决定编译哪些语言。
  let EDITION = "x"; // 源码/网页在线版默认全能(X)；离线单文件按 R/M/X 各自注入。可用 HC.setEdition() 覆盖。
  function setEdition(e) { EDITION = String(e || "").toLowerCase()[0] === "r" ? "r" : String(e || "").toLowerCase()[0] === "m" ? "m" : "x"; }
  // v3.66 三版发布：R(标准,+py) / M(轻量,仅hic) / X(全能,+py+cpp)。
  // 引擎统一解析全部语言块，具体版本决定「哪些语言可被 HIC 编译进 HTML」以及打包形态。
  // 块语法：html:(…)end（原样 HTML）、py:(…)end（HIC 编译 Python→HTML）、cpp:(…)end（HIC 编译 C++→HTML）
  const BLOCK_LANG = { html: "html", py: "py", py3: "py", cpp: "cpp", cxx: "cpp" };
  function mapLang(name) { return BLOCK_LANG[String(name || "").toLowerCase()] || "html"; }

  /* ---- 标准库（use 指令）：原生/后端运行时可用模块白名单 ---- */
  // 说明：这些 Python 标准库模块在「网页/HTML 输出」中为可识别不报错的占位；
  //       在打包/原生运行时（.zip / backend.py 后端脚本）中导入使用。
  const STDLIB = {
    os: "与操作系统交互：创建/删除文件目录、获取环境变量等",
    sys: "与 Python 解释器交互：命令行参数 argv、解释器版本与路径",
    subprocess: "创建与管理子进程，在代码里执行系统命令",
    math: "标准数学函数",
    random: "生成随机数",
    decimal: "高精度浮点数运算",
    json: "处理 JSON 数据",
    csv: "读写 CSV 文件",
    re: "正则表达式：字符串搜索与替换",
    string: "通用字符串操作",
    time: "各种时间函数",
    datetime: "日期与时间的高级接口",
    shutil: "高级文件操作（复制/移动/压缩）",
    tempfile: "生成临时文件与目录",
    zipfile: "读写 ZIP 压缩包",
    gzip: "读写 gzip 压缩文件",
    pickle: "把 Python 对象序列化到文件",
    shelve: "类似字典的持久化存储",
    sqlite3: "操作 SQLite 数据库",
    urllib: "网络：处理 URL，访问网页",
    threading: "多线程编程",
    asyncio: "异步 I/O 并发编程"
  };
  const STD_MODULES = Object.keys(STDLIB);

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // 标识符：支持英文与中文（中日韩统一表意文字）开头的变量名
  const ID_START = "A-Za-z_\\u4e00-\\u9fff";
  const ID_CHAR = "A-Za-z0-9_\\u4e00-\\u9fff";
  const NAME_RE = new RegExp("^[" + ID_START + "][" + ID_CHAR + "]*$");
  function isName(s) { return NAME_RE.test(String(s || "")); }
  const PY_TYPES = ["int", "float", "str", "bool", "list", "dict", "tuple"];
  // 全角/数学符号运算符 → 半角等价（人性化编译：兼容中文输入法全角符号、≥ ≤ ≠ 等）
  const FULLWIDTH_OPS = {
    "\uFF0B": "+", "\uFF0D": "-", "\u2212": "-", "\u00D7": "*", "\u00F7": "/", "\uFF05": "%",   // ＋ － − × ÷ ％
    "\uFF1D": "==", "\uFF1C": "<", "\uFF1E": ">",                                   // ＝ ＜ ＞
    "\u2265": ">=", "\u2264": "<=", "\u2260": "!=",                                 // ≥ ≤ ≠
    "\uFF08": "(", "\uFF09": ")"                                                     // （ ）
  };

  /* ---------------- 词法：表达式求值（安全，无 eval） ---------------- */
  function tokenize(expr) {
    const out = []; let i = 0; const n = expr.length;
    while (i < n) {
      const c = expr[i];
      if (c === " " || c === "\t" || c === "\u3000") { i++; continue; }
      if (FULLWIDTH_OPS[c]) { out.push({ t: FULLWIDTH_OPS[c], v: FULLWIDTH_OPS[c] }); i++; continue; }
      if (c === "(") { out.push({ t: "(", v: c }); i++; continue; }
      if (c === ")") { out.push({ t: ")", v: c }); i++; continue; }
      if ("+-*/%".indexOf(c) >= 0) { out.push({ t: c, v: c }); i++; continue; }
      const two = expr.substr(i, 2);
      if (two === "==" || two === "!=" || two === "<=" || two === ">=") { out.push({ t: two, v: two }); i += 2; continue; }
      if (c === "<" || c === ">") { out.push({ t: c, v: c }); i++; continue; }
      if (c === "=") { out.push({ t: "==", v: "==" }); i++; continue; }
      if (c === '"' || c === "'") {
        const q = c; let j = i + 1, s = "";
        while (j < n && expr[j] !== q) { s += expr[j]; j++; }
        out.push({ t: "str", v: s }); i = Math.min(j + 1, n); continue;
      }
      if (/[0-9]/.test(c)) {
        let j = i; let num = "";
        while (j < n && /[0-9.]/.test(expr[j])) { num += expr[j]; j++; }
        out.push({ t: "num", v: Number(num) }); i = j; continue;
      }
      if (/[A-Za-z_\u4e00-\u9fff]/.test(c)) {
        let j = i; let w = "";
        while (j < n && /[A-Za-z0-9_\u4e00-\u9fff]/.test(expr[j])) { w += expr[j]; j++; }
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
        return ""; // 未知裸标识符当空串处理
      }
      return "";
    }
    function unary() {
      if (peek() && peek().t === "-") { next(); return -Number(unary()); }
      return primary();
    }
    function mulDiv() {
      let v = unary();
      while (peek() && (peek().t === "*" || peek().t === "/" || peek().t === "%")) {
        const op = next().t; const r = unary();
        const a = Number(v), b = Number(r);
        v = op === "*" ? a * b : (op === "/" ? a / b : a % b);
      }
      return v;
    }
    function addSub() {
      let v = mulDiv();
      while (peek() && (peek().t === "+" || peek().t === "-")) {
        const op = next().t; const r = mulDiv();
        v = Number(v) + (op === "+" ? Number(r) : -Number(r));
      }
      return v;
    }
    function cmp() {
      let l = addSub();
      while (peek() && ["==", "!=", "<", ">", "<=", ">=", "in"].indexOf(peek().t) >= 0) {
        const op = next().t; const r = addSub(); l = applyCmp(op, l, r);
      }
      return l;
    }
    function notExpr() { if (peek() && peek().t === "not") { next(); return !truthy(notExpr()); } return cmp(); }
    function andExpr() { let v = notExpr(); while (peek() && peek().t === "and") { next(); v = truthy(v) && truthy(notExpr()); } return v; }
    function orExpr() { let v = andExpr(); while (peek() && peek().t === "or") { next(); v = truthy(v) || truthy(andExpr()); } return v; }
    try { return orExpr(); } catch (e) { return false; }
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
    // 语言块（html/py/cpp）：`块名:( … )end` 起始 / 结束标记（括号内为对应语言源码，HIC 不参与编译）
    const lsm = line.match(/^(html|py|py3|cpp|cxx)\s*:\s*\(\s*$/i);
    if (lsm) return { kind: "blockStart", lang: mapLang(lsm[1]) };
    if (/^\)\s*end\s*$/i.test(line)) return { kind: "blockEnd" };
    // 标准库导入：use 模块[, 模块...]
    const usem = line.match(/^use\s+(.+)$/i);
    if (usem) return { kind: "use", modules: usem[1].split(/[,\uFF0C\s]+/).filter(Boolean).map(function (m) { return m.trim(); }) };
    // 触发区域结束：cf NAME stop
    const cfE = line.match(/^cf\s+([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s+stop\s*$/i);
    if (cfE) return { kind: "regionEnd", name: cfE[1] };
    // 触发区域开始：cf NAME
    const cfS = line.match(/^cf\s+([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s*$/i);
    if (cfS) return { kind: "regionStart", name: cfS[1] };
    // it 变量声明（支持中文变量名）
    const itm = line.match(/^it\s+([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)(?:\s+([A-Za-z0-9_]+))?(?:\s+(.*))?$/);
    if (itm) {
      const name = itm[1];
      let type = itm[2] || "";
      let value = (itm[3] || "").trim();
      // app 类型：可上传任意文件、供用户下载的可下载文件变量
      if (type === "app") return { kind: "it", name, vtype: "app", type: "app", value: "" };
      // p 类型：图像；支持 URL 内嵌（http/https/data 开头），否则由变量面板上传
      let kind;
      if (type === "p") {
        kind = "img";
        const low = value.toLowerCase();
        if (value && !/^(https?:\/\/|data:image)/i.test(low)) value = ""; // 仅保留 URL / data 图
      }
      else if (type === "t") { kind = "text"; }
      else { kind = "ordinary"; }
      if (type !== "t" && type !== "p" && type !== "app") type = "ordinary"; // int/str... 归普通
      return { kind: "it", name, vtype: kind, type, value };
    }
    // in 展示：name in t 标题 / in s 副标题 / in b 正文 / in p 图片 / in link 链接 / in d 下载
    const inm = line.match(/^([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s+in\s+(t|p|s|b|d|text|img|sub|body|link|download)\b/i);
    if (inm) {
      const mode = inm[2].toLowerCase();
      if (mode === "d" || mode === "download") return { kind: "in", name: inm[1], mode: "download" }; // 触发浏览器下载
      const map = { t: "text", text: "text", p: "img", img: "img", s: "sub", sub: "sub", b: "body", body: "body", link: "link" };
      return { kind: "in", name: inm[1], mode: map[mode] || "text" };
    }
    // in point x y：图形化定位（绝对坐标像素，配合图形画布确定点位）
    const ptm = line.match(/^([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s+in\s+point\s+([A-Za-z0-9_\u4e00-\u9fff.+-]+)\s+([A-Za-z0-9_\u4e00-\u9fff.+-]+)\s*$/i);
    if (ptm) return { kind: "in", name: ptm[1], mode: "point", x: ptm[2], y: ptm[3] };
    // for 循环头：for 变量 in 迭代源:
    const form = line.match(/^for\s+([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s+in\s+(.+?)\s*:\s*$/i);
    if (form) return { kind: "for", var: form[1], iter: form[2].trim() };
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
  // html:( ... )end 块内容去缩进：去掉与块起始行相同的最多 base 个前导空格/制表符
  function dedentHtml(lines, base) {
    return lines.map(function (l) {
      if (l.trim() === "") return "";
      let n = 0;
      for (let k = 0; k < l.length; k++) {
        if (l[k] === " ") n += 1;
        else if (l[k] === "\t") n += 2;
        else break;
      }
      const cut = n > base ? base : n;
      return l.slice(cut);
    });
  }

  function parse(code) {
    // 先把多行 html:( ... )end 块折叠为单个原子节点；括号内为原样 HTML，HIC 不编译、按声明顺序直接注入
    const rawLines = String(code || "").split("\n");
    const ls = [];
    for (let li = 0; li < rawLines.length; li++) {
      const raw = rawLines[li];
      const mt = raw.match(/^[ \t]*/)[0];
      const lt = raw.replace(/(^|[ \t])#.*$/, "").trim();
      if (/^(html|py|py3|cpp|cxx)\s*:\s*\(\s*$/i.test(lt)) {
        const lang = mapLang(lt.match(/^([a-z0-9]+)\s*:/i)[1]);
        const baseIndent = mt.replace(/\t/g, "  ").length;
        const inner = [];
        let j = li + 1, closed = false;
        for (; j < rawLines.length; j++) {
          if (/^\)\s*end\s*$/i.test(rawLines[j].replace(/(^|[ \t])#.*$/, "").trim())) { closed = true; break; }
          inner.push(rawLines[j]);
        }
        const code = dedentHtml(inner, baseIndent).join("\n");
        if (lang === "html") { ls.push({ indent: baseIndent, kind: "htmlBlock", html: code }); }
        else { ls.push({ indent: baseIndent, kind: lang === "py" ? "pyBlock" : "cppBlock", lang: lang, code: code }); }
        li = closed ? j : (j - 1 > li ? j - 1 : li);
        continue;
      }
      if (!lt) continue; // 纯空白/注释行跳过
      const indent = mt.replace(/\t/g, "  ").length;
      ls.push({ indent, line: lt });
    }

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
        if (cur.kind === "htmlBlock" || cur.kind === "pyBlock" || cur.kind === "cppBlock") { // 语言块：原子节点，按声明顺序放置
          if (pendingIf) { out.push(pendingIf); pendingIf = null; }
          out.push(cur);
          i++;
          continue;
        }
        const st = classify(cur.line);
        if (st.kind === "cond" && st.type === "if") {
          if (pendingIf) out.push(pendingIf);
          pendingIf = { kind: "cond", cond: st.cond, body: [], chains: [] };
          i++;
          const bodyEnd = collectUntil(i, end, indentGoal);
          pendingIf.body = build(i, bodyEnd, minIndent(i, bodyEnd));
          i = bodyEnd;
        } else if (st.kind === "for") {
          if (pendingIf) { out.push(pendingIf); pendingIf = null; }
          i++;
          const bodyEndFor = collectUntil(i, end, indentGoal);
          out.push({ kind: "for", var: st.var, iter: st.iter, body: build(i, bodyEndFor, minIndent(i, bodyEndFor)) });
          i = bodyEndFor;
        } else if (st.kind === "regionStart") {
          // 触发区域：cf NAME ... cf NAME stop。body 为区域内的代码块（点击/长按触发执行）
          if (pendingIf) { out.push(pendingIf); pendingIf = null; }
          const rname = st.name;
          i++;
          let stopIdx = -1;
          for (let k = i; k < end; k++) {
            const lk = classify(ls[k].line);
            if (ls[k].indent === indentGoal && lk.kind === "regionEnd" && lk.name === rname) { stopIdx = k; break; }
            if (ls[k].indent <= indentGoal && k > i) break; // 未匹配到 stop 便退回上层
          }
          if (stopIdx >= 0) {
            out.push({ kind: "region", name: rname, body: build(i, stopIdx, minIndent(i, stopIdx)) });
            i = stopIdx + 1;
          } else {
            out.push({ kind: "region", name: rname, body: build(i, end, minIndent(i, end)) });
            i = end;
          }
        } else if (st.kind === "regionEnd") {
          // 孤立的区域结束标记：忽略（容错）
          i++;
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
          let val = n.value || "";
          // 数值变量：普通变量的值为纯数字时存为 number，便于算术与数值比较
          if (n.vtype !== "text" && n.vtype !== "img" && val !== "" && !isNaN(Number(val))) {
            val = Number(val);
          }
          vars[n.name] = { type: n.vtype || "ordinary", value: val, isImg: (n.vtype === "img") };
        }
      } else if (n.kind === "for") {
        collectVars(n.body, vars);
      } else if (n.kind === "region") {
        collectVars(n.body, vars);
      } else if (n.kind === "cond") {
        collectVars(n.body, vars);
        n.chains.forEach(function (c) { collectVars(c.body, vars); });
        if (n.orphan) { /* orphan body already collected */ }
      }
    });
    return vars;
  }

  // for 迭代源解析：返回值数组
  // 支持：1..5 数字区间；1..3..2 (下标区间列表)；连续数字列表 1 2 3；字符串列表 A B C；[a,b,c]；列表变量
  function iterVals(iter, vars) {
    const s = String(iter || "").trim();
    if (s === "") return [];
    // 区间 R..N（两端含端点），支持负号
    let m = s.match(/^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]); const arr = [];
      for (let v = a; a <= b ? v <= b : v >= b; a <= b ? v++ : v--) arr.push(v);
      return arr;
    }
    // 步长区间 A..B..C
    m = s.match(/^(-?\d+)\s*\.\.\s*(-?\d+)\s*\.\.\s*(-?\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]);
      const arr = [];
      if (c === 0) return arr;
      for (let v = a; c > 0 ? v <= b : v >= b; v += c) arr.push(v);
      return arr;
    }
    // 列表变量引用
    if (vars[s]) {
      const v = vars[s].value;
      if (Array.isArray(v)) return v;
      if (typeof v === "number") return [v];
      return String(v).split(/[,\uFF0C\s]+/).filter(Boolean);
    }
    // 显式列表 [a, b, c]
    if (s.charAt(0) === "[" && s.charAt(s.length - 1) === "]") {
      const inner = s.slice(1, -1).trim();
      if (inner === "") return [];
      return inner.split(/[,\uFF0C\s]+/).filter(Boolean).map(function (t) {
        const u = t.trim(), n = Number(u);
        return (u !== "" && !isNaN(n)) ? n : u;
      });
    }
    // 空格/逗号分隔的值序列
    return s.split(/[,\uFF0C\s]+/).filter(Boolean).map(function (t) {
      const u = t.trim(), n = Number(u);
      return (u !== "" && !isNaN(n)) ? n : u;
    });
  }

  // 字符串插值：把 {变量名} 替换为对应变量的当前值（未赋值则保留原样）
  function interpolate(str, vars) {
    if (typeof str !== "string") return str;
    return str.replace(/\{([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\}/g, function (m, name) {
      const v = vars[name];
      if (v && typeof v.value !== "undefined") return String(v.value);
      return m;
    });
  }

  function resolveCoord(raw, vars) {
    const s = String(raw == null ? "" : raw).trim();
    if (s === "") return 0;
    const num = Number(s);
    if (!isNaN(num)) return num;
    if (vars[s] && typeof vars[s].value !== "undefined") {
      const nv = Number(vars[s].value);
      return isNaN(nv) ? 0 : nv;
    }
    return 0;
  }

  function renderNodes(nodes, vars, ctx, out) {
    nodes.forEach(function (n) {
      if (n.kind === "it") {
        out.push(n); // 声明保留（供变量面板）
      } else if (n.kind === "in") {
        const v = vars[n.name];
        if (!v) return;
        // 非图片展示支持 {变量} 字符串插值
        const dispVal = (n.mode === "img") ? v.value : interpolate(v.value, vars);
        const item = { kind: "display", name: n.name, mode: n.mode, value: dispVal };
        if (n.mode === "point") {
          item.x = resolveCoord(n.x, vars);
          item.y = resolveCoord(n.y, vars);
        }
        if (n.mode === "download") item.file = v.file || null; // 附加可下载文件元数据
        out.push(item);
      } else if (n.kind === "nav") {
        out.push({ kind: "nav", ...n });
      } else if (n.kind === "for") {
        // 逐个取值渲染循环体，循环变量按普通变量注入
        const vals = iterVals(n.iter, vars);
        vals.forEach(function (val) {
          const prev = vars[n.var];
          vars[n.var] = { type: "ordinary", value: val, isImg: false };
          renderNodes(n.body, vars, ctx, out);
          if (prev) vars[n.var] = prev; else delete vars[n.var];
        });
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
      } else if (n.kind === "region") {
        // 触发区域：渲染为可点击/长按的色块，其 body 子项在执行时展开显示
        out.push({ kind: "region", name: n.name, bodyItems: renderNodes(n.body, vars, ctx, []) });
      } else if (n.kind === "htmlBlock") {
        // 原样 HTML：不编译，直接注入最终导出
        out.push({ kind: "htmlBlock", html: n.html });
      } else if (n.kind === "pyBlock") {
        // 扩展编译：Python → HTML（R/X 版内置编译能力；M 版仅保留源码）
        out.push({ kind: "pyBlock", lang: "py", code: n.code });
      } else if (n.kind === "cppBlock") {
        // 扩展编译：C++ → HTML（X 版内置；其余版本仅保留源码）
        out.push({ kind: "cppBlock", lang: "cpp", code: n.code });
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
    // 绑定图片：优先使用内嵌 URL（it a p https://...），否则取变量面板上传的图片
    Object.keys(vars).forEach(function (k) {
      const v = vars[k];
      if (v.isImg) {
        if (!/^(https?:\/\/|data:image)/i.test(String(v.value || ""))) {
          v.value = (page.images && page.images[k]) || "";
        }
      }
      // 绑定 app 文件：可下载文件变量（it a app + a in d）
      if (v.type === "app") {
        const f = (page.files && page.files[k]) || null;
        v.file = f;
        v.value = (f && f.dataURL) || "";
      }
    });
    const items = renderNodes(nodes, vars, {}, []);
    return { vars, items };
  }

  /* ---------------- HTML 生成 ---------------- */
  const PAGE_CSS = [
    "*{box-sizing:border-box;margin:0;padding:0;}",
    "body{font-family:-apple-system,'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif;background:#1a1510;color:#f2e9da;line-height:1.7;}",
    ".hic-page{min-height:100vh;position:relative;}",
    ".hic-bar{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 18px;",
    " background:rgba(255,252,244,.08);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,230,190,.16);}",
    ".hic-bar .t{font-weight:700;margin-right:auto;color:#d9ae6b;}",
    ".hic-bar button,.hic-bar a{padding:7px 14px;border-radius:999px;border:1px solid rgba(255,230,190,.25);",
    " background:transparent;color:#f2e9da;cursor:pointer;text-decoration:none;font-size:13px;}",
    ".hic-bar button:hover,.hic-bar a:hover{border-color:#d9ae6b;color:#d9ae6b;}",
    ".hic-bar .on{border-color:#d9ae6b;color:#15100b;background:#d9ae6b;font-weight:600;}",
    ".hic-item{max-width:860px;margin:34px auto;padding:0 20px;text-align:center;}",
    ".hic-text{font-size:42px;font-weight:800;letter-spacing:.5px;line-height:1.3;}",
    ".hic-sub{font-size:24px;font-weight:600;color:#cbb995;margin-top:10px;}",
    ".hic-body{max-width:640px;text-align:left;font-size:16px;color:#cfc3ab;line-height:1.9;}",
    ".hic-linkwrap{text-align:center;}",
    ".hic-href{display:inline-block;margin-top:8px;padding:12px 26px;border-radius:999px;border:1px solid rgba(217,174,107,.5);color:#d9ae6b;font-size:15px;text-decoration:none;transition:background .2s,color .2s;}",
    ".hic-href:hover{background:#d9ae6b;color:#15100b;}",
    ".hic-link{margin-top:14px;font-size:14px;color:#8d7f63;}",
    ".hic-imgwrap{max-width:860px;margin:40px auto;padding:0 20px;text-align:center;}",
    ".hic-img{max-width:100%;max-height:70vh;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.4);}",
    ".hic-void{opacity:.4;}",
    ".hic-navrow{margin-top:34px;}",
    ".hic-point{position:absolute;transform:translate(-50%,-50%);z-index:10;}",
    ".hic-point-text{display:inline-block;padding:8px 16px;border-radius:10px;background:rgba(217,174,107,.16);color:#f2e9da;font-size:15px;white-space:nowrap;}",
    ".hic-point-img{display:block;max-width:220px;max-height:220px;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.42);}",
    ".hic-point-img.hic-void{opacity:.35;}",
    ".hic-region{max-width:860px;margin:26px auto;padding:0 20px;}",
    ".hic-region-btn{width:100%;display:flex;align-items:center;gap:10px;padding:16px 20px;border-radius:16px;",
    " border:1px dashed rgba(217,174,107,.5);background:linear-gradient(135deg,rgba(217,174,107,.18),rgba(217,174,107,.05));",
    " color:#f2e9da;font-size:17px;font-weight:700;cursor:pointer;transition:box-shadow .2s,transform .1s;text-align:left;}",
    ".hic-region-btn::before{content:'◈';color:#d9ae6b;font-size:18px;}",
    ".hic-region.on .hic-region-btn{background:linear-gradient(135deg,rgba(217,174,107,.34),rgba(217,174,107,.12));border-style:solid;}",
    ".hic-region.pulse .hic-region-btn{box-shadow:0 0 0 8px rgba(217,174,107,.35);}",
    ".hic-region-body{margin-top:12px;border-radius:14px;background:rgba(255,252,244,.05);border:1px solid rgba(255,230,190,.12);padding:6px 0;}",
    ".hic-dlwrap{text-align:center;}",
    ".hic-dl{display:inline-block;padding:13px 28px;border-radius:999px;border:1px solid rgba(217,174,107,.55);color:#d9ae6b;font-size:15px;text-decoration:none;",
    " background:rgba(217,174,107,.08);}",
    ".hic-dl:hover{background:#d9ae6b;color:#15100b;}",
    ".hic-dl[disabled]{opacity:.45;cursor:not-allowed;}",
    ".hic-ext{max-width:860px;margin:30px auto;padding:0 20px;}",
    ".hic-ext-head{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#8d7f63;margin-bottom:8px;}",
    ".hic-ext-src{margin:0;padding:16px;border-radius:12px;background:rgba(0,0,0,.35);border:1px solid rgba(255,230,190,.14);",
    " font:13px/1.6 ui-monospace,Consolas,Menlo,monospace;color:#e6dcc6;white-space:pre-wrap;overflow-x:auto;}",
    ".hic-ext-out{margin-top:8px;padding:12px 16px;border-radius:12px;background:rgba(217,174,107,.08);border:1px dashed rgba(217,174,107,.35);}",
    ".hic-ext-state{font-size:12.5px;color:#8d7f63;}",
    ".hic-ext-run{margin:0;padding-top:6px;font:13px/1.6 ui-monospace,Consolas,Menlo,monospace;color:#d9ae6b;white-space:pre-wrap;word-break:break-word;}",
    "@media(max-width:700px){.hic-text{font-size:32px;}}"
  ].join("\n");

  function pageSlug(p) { return (p && p.name) ? p.name : "page"; }

  function renderItems(items, ctx) {
    // ctx: { page, pageKey, pageNames[], projects[], single, mode }
    return items.map(function (it) {
      if (it.kind === "display" && it.mode === "text") {
        return '<p class="hic-item hic-text">' + esc(it.value) + "</p>";
      }
      if (it.kind === "display" && it.mode === "sub") {
        return '<p class="hic-item hic-sub">' + esc(it.value) + "</p>";
      }
      if (it.kind === "display" && it.mode === "body") {
        return '<p class="hic-item hic-body">' + esc(it.value) + "</p>";
      }
      if (it.kind === "display" && it.mode === "link") {
        const href = it.value ? String(it.value) : "#";
        return '<div class="hic-item hic-linkwrap"><a class="hic-href" href="' + esc(href) +
          '" target="_blank" rel="noopener">' + esc(it.value) + "</a></div>";
      }
      if (it.kind === "display" && it.mode === "img") {
        const src = it.value ? esc(it.value) : "";
        return '<div class="hic-item hic-imgwrap"><img class="hic-img' + (src ? "" : " hic-void") + '" src="' + src +
          '" alt="' + esc(it.name) + '"' + (src ? "" : " onerror=\"this.classList.add('hic-void')\"") + "></div>";
      }
      if (it.kind === "display" && it.mode === "download") {
        const f = it.file || null;
        const hasFile = f && f.dataURL;
        const dlName = (f && f.name) || it.name;
        if (!hasFile) {
          return '<div class="hic-item hic-dlwrap"><button class="hic-dl" disabled>「' + esc(it.name) + "」未上传文件</button></div>";
        }
        const kindTag = f.type ? ('<span class="hic-link" style="margin-left:10px;font-size:13px;">' + esc(f.type) + "</span>") : "";
        return '<div class="hic-item hic-dlwrap"><a class="hic-dl" href="' + esc(f.dataURL) +
          '" download="' + esc(dlName) + '">⬇ 下载 ' + esc(dlName) + "</a>" + kindTag + "</div>";
      }
      if (it.kind === "region") {
        const inner = renderItems(it.bodyItems, ctx);
        return '<div class="hic-region" data-region="' + esc(it.name) + '">' +
          '<button type="button" class="hic-region-btn" data-name="' + esc(it.name) + '">' + esc(it.name) + ' 触发区域</button>' +
          '<div class="hic-region-body" hidden>' + inner + "</div></div>";
      }
      if (it.kind === "htmlBlock") {
        // 原样 HTML：按声明顺序原样注入最终导出（不做转义与编译）
        return it.html;
      }
      if (it.kind === "pyBlock" || it.kind === "cppBlock") {
        // 扩展语言块：HIC 把括号内源码【编译进最终 HTML】。源码原样保留，
        // 由页面内置「扩展编译器宿主」在打开时编译/执行为可运行 HTML 输出。
        const out = '<pre class="hic-ext-src">' + esc(it.code) + "</pre>";
        return '<div class="hic-ext" data-lang="' + it.lang + '">' +
          '<div class="hic-ext-head"><span>' + (it.lang === "py" ? "Python · py:( … )end" : "C++ · cpp:( … )end") + "</span></div>" + out +
          '<div class="hic-ext-out" data-out>' +
            '<span class="hic-ext-state">正在编译…</span><pre class="hic-ext-run"></pre></div></div>';
      }
      if (it.kind === "display" && it.mode === "point") {
        const x = Number(it.x) || 0, y = Number(it.y) || 0;
        const src = it.value ? String(it.value) : "";
        const isImg = src.indexOf("data:image") === 0;
        const inner = isImg
          ? '<img class="hic-point-img' + (src ? "" : " hic-void") + '" src="' + esc(src) + '" alt="' + esc(it.name) + '">'
          : '<span class="hic-point-text">' + esc(it.value) + "</span>";
        return '<div class="hic-point" data-name="' + esc(it.name) + '" style="left:' + x + 'px;top:' + y + 'px;">' + inner + "</div>";
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
        return '<p class="hic-item hic-body">' + esc(it.text) + "</p>";
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
      if (ctx.mode === "zip") {
        const fn = ctx.projSlug + "-" + slugify(targetPage) + ".html";
        return { href: fn, label: targetPage };
      }
      if (ctx.mode === "singlepage") {
        // 单页导出不含其它页面，禁用跳转，避免生成不存在的 .html 造成 404
        return { kind: "disabled" };
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
      "<script>window.HIC_EDITION='", EDITION, "';<\/script>\n",
      "<style>\n", PAGE_CSS, "\n</style>\n</head>\n<body>\n", inner, "\n",
      "<script>", opts.navJs || "", "\n", extJsBlock(), "<\/script>\n</body>\n</html>"
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

  // 触发区域交互：点击切换显示/隐藏；长按（约0.6秒）同样触发并加脉冲高亮
  function regionJsBlock() {
    const js =
      "(function(){function R(el){var body=el.querySelector('.hic-region-body');var btn=el.querySelector('.hic-region-btn');" +
      "var t=null;function fire(){body.hidden=!body.hidden;el.classList.toggle('on',!body.hidden);}" +
      "function down(){t=setTimeout(function(){fire();el.classList.add('pulse');setTimeout(function(){el.classList.remove('pulse');},650);},560);}" +
      "function up(){clearTimeout(t);}" +
      "if(btn){btn.addEventListener('click',fire);btn.addEventListener('touchstart',down,{passive:true});btn.addEventListener('touchend',up);" +
      "btn.addEventListener('mousedown',down);btn.addEventListener('mouseup',up);btn.addEventListener('mouseleave',up);}}" +
      "document.querySelectorAll('.hic-region').forEach(R);})();";
    return js;
  }
  // 扩展编译器宿主（HIC 内建，自包含，不依赖任何外部官方库 / CDN / 网址）。
  // 把 py:(…)/cpp:(…) 块内的源码由 HIC 自己【编译成 HTML】：
  //   - Python：HIC 内置 Python→JS 转译器，将括号内 Py 源码译为 JS，执行后在块内输出 HTML。
  //   - C++ ：HIC 内置 C++→JS 转译器（覆盖 main/cout/printf/变量/if/for 等轻量子集）。
  // 全程离线可达，仅在导出页存在 .hic-ext 时激活，纯 HIC 页面不引入任何运行时代码。
  function extJsBlock() {
    const js = [
      "(function(){var ex=document.querySelectorAll('.hic-ext');if(!ex.length)return;",
      "var E=(window.HIC_EDITION||'').toLowerCase();",
      "var hasPy=(E===''||E==='r'||E==='x');var hasCpp=(E===''||E==='x');",
      "function noCap(el,m){var o=el.querySelector('.hic-ext-run');var s=el.querySelector('.hic-ext-state');",
      "if(s)s.textContent=m;if(o)o.textContent=el.querySelector('.hic-ext-src').textContent;",
      "o&&o.classList.add('hic-fail');}",
      "function st(el,t){var x=el.querySelector('.hic-ext-state');if(x)x.textContent=t;}",
      // ---- Python→JS 转译（缩进→花括号，内置常用内置函数，输出走 out()）----
      "function pyInd(s){var n=0;for(var i=0;i<s.length;i++){n+=s.charAt(i)==='\\t'?4:1;}return n;}",
      "function pySplitTop(a){var r=[],d=0,b=0,m='',q='',i;",
      "for(i=0;i<a.length;i++){var c=a.charAt(i);",
      "if(q){m+=c;if(c===q&&a.charAt(i-1)!=='\\\\')q='';continue;}",
      "if(c==='\\''||c==='\"'){q=c;m+=c;continue;}",
      "if(c==='(')d++;else if(c===')')d--;",
      "if(c==='[')b++;else if(c===']')b--;",
      "if(c===','&&d===0&&b===0){r.push(m.trim());m='';}else{m+=c;}}",
      "if(m.trim())r.push(m.trim());return r;}",
      "function pyToJs(code){",
      "var lines=String(code||'').split('\\n'),stack=[-1],out=[],i;",
      "function tr(e){if(e===undefined||e===null)return 'null';var s=String(e);",
      "var q=s.indexOf(String.fromCharCode(34))<0&&s.indexOf(String.fromCharCode(39))<0;",
      "s=s.replace(/\\bTrue\\b/g,'true').replace(/\\bFalse\\b/g,'false').replace(/\\bNone\\b/g,'null').replace(/\\bstr\\s*\\(/gi,'String(');",
      "if(q){s=s.replace(/(^|[^.'\"A-Za-z0-9_])and($|[^.'\"A-Za-z0-9_])/g,'$1&&$2')",
      ".replace(/(^|[^.'\"A-Za-z0-9_])or($|[^.'\"A-Za-z0-9_])/g,'$1||$2')",
      ".replace(/(^|[^.'\"A-Za-z0-9_])not($|[^.'\"A-Za-z0-9_])/g,'$1!$2')",
      ".replace(/\\bstr\\s*/gi,'String');}",
      "return s;}",
      "function header(t){var m;",
      "m=/^def\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\((.*)\\)\\s*:$/.exec(t);if(m)return 'function '+m[1]+'('+m[2]+'){';",
      "m=/^if\\s+(.+):$/.exec(t);if(m)return 'if('+tr(m[1])+'){';",
      "m=/^elif\\s+(.+):$/.exec(t);if(m)return '}else if('+tr(m[1])+'){';",
      "m=/^else\\s*:$/.exec(t);if(m)return '}else{';",
      "m=/^while\\s+(.+):$/.exec(t);if(m)return 'while('+tr(m[1])+'){';",
      "m=/^for\\s+([A-Za-z_][A-Za-z0-9_]*)\\s+in\\s+(.+):$/.exec(t);if(m)return 'for(var '+m[1]+' of '+tr(m[2])+'){';",
      "return null;}",
      "function stmt(t){var m=/^print\\s*\\((.*)\\).*$/.exec(t);",
      "if(m){var A=pySplitTop(m[1]).map(function(x){return tr(x);}).join(',');return 'out(arr('+A+'))';}",
      "var rv=/^return\\s+(.+)$/.exec(t);if(rv)return 'return '+tr(rv[1])+';';",
      "m=/^([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.+)$/.exec(t);if(m)return tr(m[1])+'='+tr(m[2])+';';",
      "return tr(t)+';';}",
      "for(i=0;i<lines.length;i++){var raw=lines[i];",
      "var mm=raw.replace(/\\t/g,'    ').match(/^( *)(.*)$/);var ind=mm[1].length;var text=mm[2].trim();",
      "if(!text||text.charAt(0)==='#')continue;",
      "while(stack.length>1&&ind<=stack[stack.length-1]){out.push('}');stack.pop();}",
      "var h=header(text);",
      "if(h){out.push(h);var indHere=ind;stack.push(indHere);}",
      "else{out.push(stmt(text));}}",
      "while(stack.length>1){out.push('}');stack.pop();}window.__pycl=out.slice();window.__pyln=lines.map(function(r){var x=r.replace(/\\t/g,'    ').match(/^( *)/);return x[1].length+'|'+r;});",
      "return out.join('\\n');}",
      "function arr(){var a=[].slice.call(arguments);var s=[];for(var k=0;k<a.length;k++){var v=a[k];",
      "if(Array.isArray(v))s.push(v.join(' '));else s.push(v===undefined?'None':String(v));}return s.join(' ');}",
      "function range(a,b,c){var s=[],start,end,stp=1,x;",
      "if(arguments.length<2){start=0;end=a;}else{start=a;end=b;}",
      "if(arguments.length>2)stp=c;stp=stp||1;",
      "if(stp>0){for(x=start;x<end;x+=stp)s.push(x);}else{for(x=start;x>end;x+=stp)s.push(x);}return s;}",
      "function len(x){return (x==null?0:x.length);}",
      "function abs(x){return Math.abs(Number(x));}",
      "function round(x){return Math.round(Number(x));}",
      "function minx(){return Math.min.apply(null,[].slice.call(arguments));}",
      "function maxx(){return Math.max.apply(null,[].slice.call(arguments));}",
      "function intv(x){return parseInt(x,10);}function fltv(x){return parseFloat(x);}",
      "function runPy(el){if(!hasPy){return noCap(el,'本版本未含 Python 编译能力（M 轻量版仅 HIC）。');}",
      "var code=el.querySelector('.hic-ext-src').textContent,o=el.querySelector('.hic-ext-run');",
      "st(el,'HIC 正在编译 Python → HTML …');",
      "try{var _js=pyToJs(code),outH='';window.__pyjs=_js;",
      "function out(s){outH+=String(s==null?'':s)+'\\n';}",
      "var run=new Function('out','arr','range','len','abs','round','min','max','int','float','str',_js);",
      "run(out,arr,range,len,abs,round,minx,maxx,intv,fltv,String);",
      "var txt=outH.replace(/\\n+$/,'');o.textContent=txt||'(程序无输出)';st(el,'✓ 已编译为 HTML 输出');}",
      "catch(e){st(el,'编译失败：'+e.message);o.textContent=e.message;o.classList.add('hic-fail');}}",
      // ---- C++→JS 转译（main/cout/变量/if/for/return 轻量子集）----
      "function cppToJs(code){var src=String(code||'');",
      "src=src.replace(/\\/\\/.*$/gm,'').replace(/^[ \\t]*\\#[^\\n]*$/gm,'').replace(/using[^;]*;/g,'').replace(/\\bstd::cout\\b/g,'cout').replace(/\\bstd::endl\\b/g,'endl');",
      "var m=/\\b(?:int|void|auto)\\s+main\\s*\\([^;]*\\)\\s*\\{([\\s\\S]*)\\}/.exec(src);",
      "if(!m){m=/main\\s*\\{([\\s\\S]*)\\}/.exec(src);}var body=m?m[1]:src;",
      "body=body.replace(/(?:\\b|\\n)\\s*return\\s+[^;]+;/g,'');",
      "body=body.replace(/\\bcout\\s*<<\\s*([^;]+);/g,function(_,e){return 'out('+cppExpr(e)+');';});",
      "body=body.replace(/\\b(double|float|long|int|short|unsigned|char|string|bool|auto)\\s+([A-Za-z_]\\w*\\s*(?:\\s*=|,\\s*|\\s*;))/g,function(_,t,v){return v;});",
      "return body;}",
      "function cppExpr(e){e=String(e||'').replace(/\\bendl\\b/g,'\\n');",
      "var parts=e.split('<<');var outA=[];for(var i=0;i<parts.length;i++){var p=parts[i].trim();",
      "if(!p)continue;if(p==='\\n'){outA.push('\\n');}else{outA.push('str('+p+')');}}",
      "return outA.join('+');}",
      "function runCpp(el){if(!hasCpp){return noCap(el,'本版本未含 C++ 编译能力（R 标准版仅 HIC+Python）。');}",
      "var code=el.querySelector('.hic-ext-src').textContent,o=el.querySelector('.hic-ext-run');",
      "st(el,'HIC 正在编译 C++ → HTML …');",
      "try{var js=cppToJs(code);var _outH='';function out(s){_outH+=String(s==null?'':s)+'\\n';}",
      "function str(x){return String(x==null?'':x);}function numi(x){return String(parseInt(x,10));}",
      "function flt(x){var n=parseFloat(x);return isNaN(n)?'0':String(n);}",
      "new Function('out','str','numi','flt',js+';').call(null,out,str,numi,flt);",
      "var txt=_outH.replace(/\\n+$/,'');o.textContent=txt||'(程序无输出)';st(el,'✓ 已编译为 HTML 输出');}",
      "catch(e){st(el,'编译失败：'+e.message);o.textContent=e.message;o.classList.add('hic-fail');}}",
      "ex.forEach(function(el){var L=el.getAttribute('data-lang');if(L==='py')runPy(el);else if(L==='cpp')runCpp(el);});",
      "})();"
    ].join("\n");
    return js;
  }
  // 返回 [{line,col,msg,level}]，line 为 1 起
  function diagnose(code) {
    const msgs = [];
    const lines = String(code || "").split("\n");
    const declared = {};
    const regions = []; // {name, ln, hasStop}
    lines.forEach(function (raw, i) {
      const t = raw.trim();
      const itm = t.match(/^it\s+([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)/);
      if (itm) declared[itm[1]] = true;
      // for 循环变量视为在循环体内已声明
      const fm = t.match(/^for\s+([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s+in\b/i);
      if (fm) declared[fm[1]] = true;
      // 触发区域：cf NAME start / stop 配对校验
      const cf = t.match(/^cf\s+([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)(?:\s+(stop))?\s*$/i);
      if (cf) {
        if (cf[2]) { // stop
          const found = regions.filter(function (r) { return r.name === cf[1] && !r.hasStop; })[0];
          if (found) found.hasStop = true;
          else msgs.push({ line: i + 1, col: 0, msg: "「cf " + cf[1] + " stop」没有对应的「cf " + cf[1] + "」开始标记", level: "warn" });
        } else {
          regions.push({ name: cf[1], line: i + 1, hasStop: false });
        }
      }
      // 标准库 use 校验：未知模块告警
      const use = t.match(/^use\s+(.+)$/i);
      if (use) {
        use[1].split(/[,\uFF0C\s]+/).filter(Boolean).forEach(function (m) {
          if (STD_MODULES.indexOf(m.trim()) < 0) {
            msgs.push({ line: i + 1, col: 0, msg: "未知标准库模块「" + m.trim() + "」。可用模块：" + STD_MODULES.join("/"), level: "warn" });
          }
        });
      }
    });
    // 未闭合的触发区域
    regions.forEach(function (r) {
      if (!r.hasStop) msgs.push({ line: r.line, col: 0, msg: "触发区域「" + r.name + "」未用「cf " + r.name + " stop」闭合", level: "warn" });
    });
    const KNOWN = ["t", "p", "s", "b", "d", "text", "img", "sub", "body", "link", "point"];
    lines.forEach(function (raw, i) {
      const ln = i + 1;
      const trimmed = raw.trim();
      if (trimmed === "" || trimmed.charAt(0) === "#") return;
      const plain = raw.replace(/\\(["'])/g, "");
      const dq = (plain.match(/"/g) || []).length;
      if (dq % 2 === 1) msgs.push({ line: ln, col: (plain.lastIndexOf('"') + 1), msg: "双引号未闭合：缺少右引号", level: "error" });
      const sq = (plain.match(/'/g) || []).length;
      if (sq % 2 === 1) msgs.push({ line: ln, col: (plain.lastIndexOf("'") + 1), msg: "单引号未闭合：缺少右引号", level: "error" });
      const ob = (plain.match(/\(/g) || []).length, cb = (plain.match(/\)/g) || []).length;
      if (ob !== cb) msgs.push({ line: ln, col: 0, msg: "括号不匹配：左括号 " + ob + " 个 / 右括号 " + cb + " 个", level: "error" });
      // 变量名以数字开头
      if (/^\d[A-Za-z_\u4e00-\u9fff]/.test(trimmed)) {
        msgs.push({ line: ln, col: 0, msg: "变量名不能以数字开头", level: "error" });
        return;
      }
      // 展示未声明变量
      const inm = trimmed.match(/^([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s+in\s+(point|t|p|s|b|text|img|sub|body|link)\b/i);
      if (inm && !declared[inm[1]]) {
        msgs.push({ line: ln, col: 0, msg: "变量「" + inm[1] + "」未声明。请先用 it 声明再展示", level: "warn" });
      }
      // 未知展示模式
      const up = trimmed.match(/^([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s+in\s+([A-Za-z_]+)/i);
      if (up && KNOWN.indexOf(up[2].toLowerCase()) < 0) {
        msgs.push({ line: ln, col: (raw.indexOf(up[2]) + 1), msg: "未知展示模式「" + up[2] + "」；可用 t/s/b/link/p/point", level: "warn" });
      }
    });
    return msgs;
  }

  /* ---- 顶层导出入口 ---- */
  // pageObj: {id,name,code,images}
  function buildSinglePageHtml(project, page, opts) {
    const { items } = processPage(page, {});
    const projSlug = slugify(project.name);
    const noBar = !!(opts && opts.noBar);
    const inner = '<div class="hic-page" data-page="' + esc(page.name) + '">\n' + renderItems(items, {
      mode: "singlepage", projSlug, projName: project.name, pageName: page.name,
      projectsMap: null
    }) + "\n</div>";
    const navBar = noBar ? "" : ['<div class="hic-bar"><span class="t">', esc(project.name + " · " + page.name), "</span></div>"].join("");
    return pageShell(navBar + inner, { title: project.name + " - " + page.name, navJs: regionJsBlock() });
  }

  function buildProjectMergedHtml(project, projectsMap, opts) {
    const pages = Object.values(project.pages);
    const projSlug = slugify(project.name);
    const ctxBase = { mode: "merged", projSlug, projName: project.name, projectsMap };
    const noBar = !!(opts && opts.noBar);
    const navBar = noBar ? "" : ['<div class="hic-bar"><span class="t">', esc(project.name), "</span>",
      ...pages.map(function (p, i) {
        return '<button data-goto="' + esc(projSlug + "::" + p.name) + '"' + (i === 0 ? "" : "") + ">" + esc(p.name) + "</button>";
      }), "</div>"].join("");
    const sections = pages.map(function (p) {
      const { items } = processPage(p, {});
      const ctx = { ...ctxBase, pageName: p.name, mode: "merged" };
      return '<section class="hic-page" data-page="' + esc(projSlug + "::" + p.name) + '">\n' + renderItems(items, ctx) + "\n</section>";
    }).join("\n");
    const js = pageJsBlock(null) + regionJsBlock();
    return pageShell(navBar + sections, { title: project.name, navJs: js });
  }

  // 多项目多页面合并成一个 html（用于「多个项目统一导出」），支持同项目与原跨项目跳转
  function buildAllMergedHtml(projects, projectsMap, opts) {
    const allPages = [];
    projects.forEach(function (proj) {
      Object.values(proj.pages).forEach(function (pg) { allPages.push({ proj: proj, page: pg }); });
    });
    const noBar = !!(opts && opts.noBar);
    const navBar = noBar ? "" : ['<div class="hic-bar"><span class="t">HiCode · ', esc(String(projects.length)), " 项目</span>",
      ...allPages.map(function (ob) {
        return '<button data-goto="' + esc(slugify(ob.proj.name) + "::" + ob.page.name) + '">' + esc(ob.proj.name + " · " + ob.page.name) + "</button>";
      }), "</div>"].join("");
    const sections = allPages.map(function (ob) {
      const { items } = processPage(ob.page, {});
      const ctx = { mode: "merged", projSlug: slugify(ob.proj.name), projName: ob.proj.name, pageName: ob.page.name, projectsMap: projectsMap || {} };
      return '<section class="hic-page" data-page="' + esc(slugify(ob.proj.name) + "::" + ob.page.name) + '">\n' + renderItems(items, ctx) + "\n</section>";
    }).join("\n");
    return pageShell(navBar + sections, { title: "HiCode 合并预览（" + projects.length + " 项目）", navJs: pageJsBlock(null) + regionJsBlock() });
  }

  function buildZipEntries(projects, opts) {
    // 返回 [{name, html|data}]，name = "{proj}-{page}.html"；若页面声明了可下载文件(app+in d)则追加文件条目
    const noBar = !!(opts && opts.noBar);
    const arr = [];
    projects.forEach(function (proj) {
      Object.values(proj.pages).forEach(function (pg) {
        const { items } = processPage(pg, {});
        const ctx = { mode: "zip", projSlug: slugify(proj.name), projName: proj.name, pageName: pg.name, projectsMap: {} };
        const inner = '<div class="hic-page" data-page="' + esc(pg.name) + '">\n' + renderItems(items, ctx) + "\n</div>";
        const navBar = noBar ? "" : ['<div class="hic-bar"><span class="t">', esc(proj.name + " · " + pg.name), "</span></div>"].join("");
        arr.push({ name: slugify(proj.name) + "-" + slugify(pg.name) + ".html", html: pageShell(navBar + inner, { title: proj.name + " - " + pg.name, navJs: regionJsBlock() }) });
        // 附带 app 上传文件（.zip 专属）：dataURL → 恢复为二进制
        const files = (pg.files && typeof pg.files === "object") ? pg.files : {};
        Object.keys(files).forEach(function (v) {
          const f = files[v];
          if (f && f.dataURL && f.name) {
            const bytes = dataUrlToBytes(f.dataURL);
            if (bytes) arr.push({ name: slugify(proj.name) + "-" + slugify(pg.name) + "-" + slugify(f.name), data: bytes });
          }
        });
      });
    });
    return arr;
  }

  // 把 dataURL 还原为二进制 Uint8Array；失败返回 null
  function dataUrlToBytes(dataURL) {
    try {
      const idx = dataURL.indexOf(",");
      if (idx < 0) return null;
      const meta = dataURL.slice(0, idx);
      const b64 = dataURL.slice(idx + 1);
      let bin;
      if (meta.indexOf("base64") >= 0) { bin = atob(b64); }
      else { bin = decodeURIComponent(escape(b64)); }
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
      return out;
    } catch (e) { return null; }
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

  // 判断项目/页面是否使用了可下载文件变量（app 类型 或 in d）。若是，仅支持 .zip 导出。
  function usesDownload(obj) {
    const codes = [];
    if (obj && obj.pages) Object.values(obj.pages).forEach(function (pg) { codes.push(pg.code || ""); });
    else if (obj && typeof obj.code === "string") codes.push(obj.code);
    const re = /(^|\n)[ \t]*(it\s+[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*\s+app\b|[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*\s+in\s+(d|download)\b)/i;
    return codes.some(function (c) { return re.test("\n" + c); });
  }

  return {
    APP, STDLIB, STD_MODULES, esc, isName, parse, classify, parseNav, processPage, diagnose,
    buildSinglePageHtml, buildProjectMergedHtml, buildAllMergedHtml, buildZipEntries,
    zipFiles, zipBlob, download, dataUrlToBytes, usesDownload, evalExpr, slugify,
    setEdition
  };
});