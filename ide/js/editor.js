/* ============================================================
 * HC v1.00 —— 轻量代码编辑器 editor.js
 * 在原生 <textarea> 之上叠加「语法高亮层 + 行号栏」，保留原生编辑
 * 体验（光标/选中/撤销/粘贴），仅额外提供：
 *   1) 语法高亮  2) 行号  3) 回车自动缩进  4) 括号/引号自动补全
 * 纯 DOM，不依赖第三方库，配合离线单文件打包。
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HICED = api;
})(typeof self !== "undefined" ? self : null, function () {
  "use strict";

  const ID_START = "A-Za-z_\\u4e00-\\u9fff";
  const ID_CHAR = "A-Za-z0-9_\\u4e00-\\u9fff";
  const KEYWORDS = new Set(["it", "in", "if", "orif", "noif", "point", "to", "fr", "and", "or", "not", "for", "fn", "global", "raw", "g", "cf", "stop", "use", "app", "d", "html", "end"]);
  const TYPES = new Set(["t", "p", "s", "b", "d", "text", "img", "sub", "body", "link", "app", "int", "float", "str", "bool", "list", "dict", "tuple"]);

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // 逐字符扫描，输出带 class 的高亮 HTML
  function lineHtml(text) {
    let out = "", i = 0, n = text.length;
    // 行尾注释：# 出现在行首或前置空白
    let commentAt = -1;
    const m = text.match(/(^|[ \t])#.*$/);
    if (m) commentAt = text.indexOf("#", m[0].indexOf("#"));
    const bodyEnd = commentAt < 0 ? n : commentAt;
    function p(seg, cls) { if (seg) out += cls ? '<span class="tk ' + cls + '">' + esc(seg) + "</span>" : esc(seg); }
    while (i < bodyEnd) {
      const c = text[i];
      // 原生 HTML 块定界符 html:( / )end —— 整体高亮为“块”语义
      if (text.substr(i, 7).toLowerCase() === "html:(") { p("html:(", "bl"); i += 7; continue; }
      if (c === ")" && text.substr(i, 4).toLowerCase() === ")end") { p(")end", "bl"); i += 4; continue; }
      // 字符串（内部 {变量} 插值高亮）
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < bodyEnd && text[j] !== c) j++;
        const seg = text.slice(i, Math.min(j + 1, bodyEnd)); const segEnd = i + seg.length;
        // 逐段输出：普通字符串与 {插值} 交替
        let scan = 0;
        const re = /\{([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\}/g;
        let mi;
        while ((mi = re.exec(seg)) !== null) {
          if (mi.index > scan) p(seg.slice(scan, mi.index), "str");
          p(seg.slice(mi.index, mi.index + mi[0].length), "interp");
          scan = mi.index + mi[0].length;
        }
        if (scan < seg.length) p(seg.slice(scan), "str");
        void segEnd;
        i += seg.length; continue;
      }
      // 数字
      if (/[0-9]/.test(c)) {
        let j = i; while (j < bodyEnd && /[0-9.]/.test(text[j])) j++;
        p(text.slice(i, j), "num"); i = j; continue;
      }
      // 标识符
      if (new RegExp("[" + ID_START + "]").test(c)) {
        let j = i; while (j < bodyEnd && new RegExp("[" + ID_CHAR + "]").test(text[j])) j++;
        const w = text.slice(i, j);
        if (KEYWORDS.has(w)) p(w, "kw");
        else if (TYPES.has(w)) p(w, "ty");
        else p(w, "id");
        i = j; continue;
      }
      // 多字符运算符/全角
      const two = text.substr(i, 2);
      if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "\u2260") { p(two, "op"); i += 2; continue; }
      if ("+\uFF0B-\uFF0D\u2212*\u00D7/\u00F7%\uFF05=<>!()==".indexOf(c) >= 0 || "\uFF1D\uFF1C\uFF1E\u2265\u2264\uFF08\uFF09".indexOf(c) >= 0) { p(c, "op"); i++; continue; }
      p(c, null); i++;
    }
    if (commentAt >= 0) { p(text.slice(commentAt), "cm"); }
    return out;
  }

  const PAIRS = { "(": ")", "[": "]", '"': '"', "'": "'" };
  const CLOSE_KEYS = new Set([")", "]", '"', "'"]);

  function create(textarea) {
    if (!textarea) return null;
    const wrap = document.createElement("div");
    wrap.className = "editor-wrap";
    const gutter = document.createElement("div");
    gutter.className = "editor-gutter";
    const mark = document.createElement("div");
    mark.className = "editor-mark";
    const pre = document.createElement("pre");
    pre.className = "editor-highlight";
    pre.setAttribute("aria-hidden", "true");
    wrap.appendChild(gutter);
    wrap.appendChild(pre);
    wrap.appendChild(mark);
    textarea.parentNode.insertBefore(wrap, textarea);
    wrap.appendChild(textarea);

    function render() {
      const lines = textarea.value.split("\n");
      // 高亮层：逐行着色
      pre.innerHTML = lines.map(function (l) { return lineHtml(l); }).join("\n") + "\n";
      // 行号
      gutter.innerHTML = lines.map(function (_, i) { return '<div>' + (i + 1) + "</div>"; }).join("");
      // 行内错误标记（由诊断层写入 mark）
      syncScroll();
    }
    function syncScroll() {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
    }
    // 回车自动缩进
    function onKeyDown(e) {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = textarea.selectionStart, en = textarea.selectionEnd;
        const before = textarea.value.slice(0, s);
        const sln = before.lastIndexOf("\n");
        const selStartLine = (sln < 0) ? 0 : sln + 1;
        const prefixLine = textarea.value.slice(selStartLine, s);
        if (s !== en) {
          const segA = textarea.value.slice(0, selStartLine), segB = textarea.value.slice(selStartLine);
          const newB = segB.split("\n").map(function (ln, k) { return (k === 0 && prefixLine ? "" : "") + "  " + ln; }).join("\n");
          textarea.value = segA + newB;
          textarea.selectionEnd = en + 2 * Math.max(1, newB.split("\n").length - (prefixLine ? 1 : 1));
          textarea.selectionStart = selStartLine + (prefixLine ? 2 : 0);
        } else {
          textarea.setRangeText("  ", s, en, "end");
        }
        fireInput();
        return;
      }
      if (e.key === "Enter") {
        const s = textarea.selectionStart;
        const before = textarea.value.slice(0, s);
        const line = before.slice(before.lastIndexOf("\n") + 1);
        let ind = line.match(/^[ \t]*/)[0];
        // 当前行以 : 结尾 → 子块再缩进 4 空格
        if (/:\s*$/.test(line)) ind += "    ";
        e.preventDefault();
        textarea.setRangeText("\n" + ind, s, textarea.selectionEnd, "end");
        fireInput();
        return;
      }
      // 括号/引号自动补全
      const k = e.key;
      const s = textarea.selectionStart, en = textarea.selectionEnd;
      if (s === en && PAIRS[k]) {
        e.preventDefault();
        textarea.setRangeText(k + PAIRS[k], s, en, "start");
        textarea.selectionStart = textarea.selectionEnd = s + 1;
        fireInput();
        return;
      }
      if (s === en && CLOSE_KEYS.has(k)) {
        const afterTxt = textarea.value.charAt(en);
        if (afterTxt === k) { e.preventDefault(); textarea.selectionStart = textarea.selectionEnd = en + 1; return; }
      }
      // Backspace 成对删除
      if (e.key === "Backspace" && s === en) {
        const c1 = textarea.value.charAt(s - 1), c2 = textarea.value.charAt(s);
        if (PAIRS[c1] && c2 === PAIRS[c1]) { e.preventDefault(); textarea.setRangeText("", s - 1, s + 1, "end"); fireInput(); }
      }
      void k;
    }
    function fireInput() {
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // 行内错误/警告标记：diags = [{line,col,msg,level}]
    function setDiagnostics(diags) {
      mark.innerHTML = "";
      if (!diags || !diags.length) return;
      const lh = parseFloat(getComputedStyle(textarea).lineHeight) || 23;
      const gw = gutter.offsetWidth || 0;
      const fd = document.createDocumentFragment();
      diags.forEach(function (d) {
        const elm = document.createElement("div");
        elm.className = "ed-diag ed-diag-" + (d.level === "error" ? "err" : "warn");
        elm.title = "第 " + d.line + " 行：" + (d.msg || "");
        elm.style.top = ((d.line - 1) * lh) + "px";
        elm.style.left = "0px";
        elm.style.width = Math.max(60, (textarea.scrollWidth - gw)) + "px";
        fd.appendChild(elm);
      });
      mark.appendChild(fd);
    }
    textarea.addEventListener("input", render);
    textarea.addEventListener("keydown", onKeyDown);
    textarea.addEventListener("scroll", syncScroll);
    render();
    return {
      update: render,
      render: render,
      setDiagnostics: setDiagnostics,
      gutter: gutter,
      highlight: pre
    };
  }

  return { create: create, lineHtml: lineHtml };
});