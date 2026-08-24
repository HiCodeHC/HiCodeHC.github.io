/* ============================================================
 * HC v1.00 在线 IDE —— 界面逻辑 app.js
 * 依赖：Store (store.js) + HC (hic.js)
 * 职责：首页引导、项目/页面 CRUD、代码编辑、实时转译预览、
 *       变量面板（含 p 图片上传）、图形化画布定位、导出菜单。
 * ============================================================ */
(function () {
  "use strict";

  /* ---- 状态 ---- */
  let state = { projId: null, pageId: null, pendingImgVar: null, pendingFileVar: null, saveTimer: null, graph: { x: null, y: null } };
  let _importFileCb = null;

  const $ = function (id) { return document.getElementById(id); };
  const el = {
    home: $("home"),
    recent: $("homeRecent"),
    tree: $("tree"),
    projList: $("projList"),
    pageSec: $("pageSec"),
    pageList: $("pageList"),
    treeHint: $("treeHint"),
    code: $("code"),
    fileName: $("fileName"),
    crumb: $("crumb"),
    statusbar: $("statusbar"),
    sbLeft: $("sbLeft"),
    sbRight: $("sbRight"),
    previewFrame: $("previewFrame"),
    previewSrc: $("previewSrc"),
    varList: $("varList"),
    varEmpty: $("varEmpty"),
    probList: $("probList"),
    probEmpty: $("probEmpty"),
    outputList: $("outputList"),
    consoleOutput: $("consoleOutput"),
    consoleLog: $("consoleLog"),
    consoleFilter: $("consoleFilter"),
    btnClearConsole: $("btnClearConsole"),
    probBadge: $("probBadge"),
    probFilter: $("probFilter"),
    cntAll: $("cntAll"),
    cntErr: $("cntErr"),
    cntWarn: $("cntWarn"),
    exportMenu: $("exportMenu"),
    modal: $("modal"),
    modalTitle: $("modalTitle"),
    modalBody: $("modalBody"),
    addProject: $("addProject"),
    addPage: $("addPage"),
    btnLive: $("btnLive"),
    btnExport: $("btnExport"),
    fileImg: $("fileImg"),
    fileHc: $("fileHc"),
    fileApp: $("fileApp"),
    openPreview: $("openPreview"),
    btnToggleSrc: $("btnToggleSrc"),
    graphCanvas: $("graphCanvas"),
    graphCoord: $("graphCoord"),
    graphVarName: $("graphVarName"),
    graphContent: $("graphContent"),
    graphType: $("graphType"),
    graphDot: $("graphDot"),
    btnInsertPoint: $("btnInsertPoint"),
    btnClearGraph: $("btnClearGraph")
  };

  /* ---- 工具 ---- */
  function esc(s) { return HC.esc(s); }

  function currentProj() { return state.projId ? Store.getProject(state.projId) : null; }
  function currentPage() {
    if (!state.projId || !state.pageId) return null;
    return Store.getPage(state.projId, state.pageId);
  }

  function setStatus(msg) {
    if (el.sbLeft) el.sbLeft.textContent = msg || "";
  }
  function toastOn(title, body) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = body;
    $("modalCancel").textContent = "确定";
    $("modalOk").classList.add("hidden");
    $("modalCancel").onclick = function () { el.modal.classList.add("hidden"); };
    el.modal.classList.remove("hidden");
  }
  // 通用确认/输入弹窗，返回 Promise
  function modal(prompt, opts) {
    return new Promise(function (resolve) {
      opts = opts || {};
      el.modalTitle.textContent = opts.title || "提示";
      el.modalBody.innerHTML = opts.input
        ? '<input type="text" id="modalInput" value="' + esc(opts.value || "") + '" placeholder="' + esc(opts.placeholder || "") + '" />'
        : (opts.body || "");
      $("modalCancel").textContent = opts.cancelText || "取消";
      $("modalOk").textContent = opts.okText || "确定";
      $("modalOk").classList.remove("hidden");
      el.modal.classList.remove("hidden");
      const inp = $("modalInput");
      function done(val) { cleanup(); resolve(val); }
      function cleanup() {
        el.modal.classList.add("hidden");
        $("modalOk").onclick = null; $("modalCancel").onclick = null;
        if (inp) inp.onkeydown = null;
      }
      $("modalOk").onclick = function () { done(inp ? inp.value.trim() : $(`modalBody`).dataset.flag || true); };
      $("modalCancel").onclick = function () { done(false); };
      if (opts.input && inp) inp.onkeydown = function (e) { if (e.key === "Enter") done(inp.value.trim()); if (e.key === "Escape") done(false); };
      if (opts.input && inp) setTimeout(function () { inp.focus(); inp.select(); }, 30);
    });
  }

  /* ---- 首页引导 ---- */
  function showHome() {
    saveNow();
    el.home.classList.remove("hidden");
    const has = Store.hasAnyProject();
    el.recent.hidden = !has;
    if (has) {
      const last = Store.getProject(Store.lastProjectId());
      $("homeResume").textContent = last ? ("恢复最近项目 · " + last.name) : "恢复最近项目 →";
    }
    renderAll();
  }
  function hideHome() { el.home.classList.add("hidden"); }

  /* ---- 树渲染 ---- */
  function renderAll() {
    renderProjects();
    renderPages();
    renderOpenContent();
  }
  function renderProjects() {
    const list = Store.listProjects();
    el.treeHint.hidden = list.length > 0;
    el.projList.innerHTML = list.map(function (p) {
      return ['<li class="tree-item', p.id === state.projId ? " on" : "", '" data-id="', p.id, '">',
        '<span class="ic">▤</span>',
        '<span class="nm">', esc(p.name), '</span>',
        '<span class="n">', p.pageCount, '</span>',
        '<span class="ops"><span data-op="r">✎</span><span data-op="d">🗑</span></span>',
        "</li>"].join("");
    }).join("");
    // 点击项目 / 操作
    Array.prototype.forEach.call(el.projList.querySelectorAll(".tree-item"), function (li) {
      li.onclick = function (e) {
        const op = e.target.getAttribute && e.target.getAttribute("data-op");
        const id = li.getAttribute("data-id");
        if (op === "r") { renameProject(id); e.stopPropagation(); return; }
        if (op === "d") { deleteProject(id); e.stopPropagation(); return; }
        openProject(id);
      };
    });
  }
  function renderPages() {
    const proj = currentProj();
    el.pageSec.hidden = !proj;
    if (!proj) { el.pageList.innerHTML = ""; return; }
    el.pageList.innerHTML = Object.keys(proj.pages).map(function (pid) {
      const pg = proj.pages[pid];
      return ['<li class="tree-item', pg.id === state.pageId ? " on" : "", '" data-id="', pid, '">',
        '<span class="ic">▦</span>',
        '<span class="nm">', esc(pg.name), '</span>',
        '<span class="ops"><span data-op="r">✎</span><span data-op="d">🗑</span></span>',
        "</li>"].join("");
    }).join("");
    Array.prototype.forEach.call(el.pageList.querySelectorAll(".tree-item"), function (li) {
      li.onclick = function (e) {
        const op = e.target.getAttribute && e.target.getAttribute("data-op");
        const id = li.getAttribute("data-id");
        if (op === "r") { renamePage(id); e.stopPropagation(); return; }
        if (op === "d") { deletePage(id); e.stopPropagation(); return; }
        openPage(id);
      };
    });
  }

  /* ---- 打开/载入 ---- */
  function openProject(id) {
    saveNow();
    const proj = Store.getProject(id);
    if (!proj) return;
    state.projId = id;
    const pages = Object.keys(proj.pages);
    const storedPage = Store.lastPageId() && proj.pages[Store.lastPageId()] ? Store.lastPageId() : null;
    state.pageId = storedPage || pages[0] || null;
    if (state.pageId) Store.setActive(id, state.pageId);
    hideHome();
    renderAll();
    loadEditor();
  }
  function openPage(id) {
    saveNow();
    if (!state.projId) return;
    if (Store.getPage(state.projId, id)) { state.pageId = id; Store.setActive(state.projId, id); }
    renderAll();
    loadEditor();
  }
  function loadEditor() {
    const pg = currentPage();
    if (!pg) {
      el.code.value = ""; el.crumb.textContent = "—"; setStatus("未选择页面");
      if (el.fileName) el.fileName.textContent = "未打开文件";
      $("btnLive").classList.remove("hidden");
      return;
    }
    const proj = currentProj();
    el.crumb.textContent = proj.name + " · " + pg.name;
    if (el.fileName) el.fileName.textContent = pg.name;
    el.code.value = pg.code;
    el.code.disabled = false;
    logConsole("output", "已打开页面「" + pg.name + "」");
    if (window.hiced) window.hiced.render();
    doLive();
    updateCursorPos();
  }
  function renderOpenContent() {
    const pg = currentPage();
    if (pg && el.code.value !== pg.code && document.activeElement !== el.code) {
      // 仅在非输入焦点时同步回显，避免打断输入
    }
  }

  /* ---- 实时转译 ---- */
  function liveHtml() {
    const proj = currentProj();
    if (!proj) return "<p>请先打开一个页面</p>";
    try { return HC.buildProjectMergedHtml(proj, {}); }
    catch (e) { return "<pre>转译出错：" + esc(e.message) + "</pre>"; }
  }
  function doLive() {
    if (!state.projId || !state.pageId) { setStatus("未打开页面"); return; }
    const html = liveHtml();
    el.previewSrc.value = html;
    el.previewFrame.srcdoc = html;
    const p = currentPage();
    // 诊断：行内错误/警告
    const diags = HC.diagnose(el.code.value || "");
    const errs = diags.filter(function (d) { return d.level === "error"; });
    const warns = diags.filter(function (d) { return d.level === "warn"; });
    if (window.hiced) window.hiced.setDiagnostics(diags);
    // 控制台：仅当错误/警告数量发生变化时记录，避免逐键刷屏
    const sig = errs.length + "/" + warns.length;
    if (sig !== _diagSig) {
      const had = _diagSig !== null;
      _diagSig = sig;
      if (errs.length || warns.length) {
        logConsole(errs.length ? "error" : "warning", "转译发现 " + errs.length + " 个错误、" + warns.length + " 个警告");
      } else if (had) {
        logConsole("output", "问题已修复，转译成功 · 生成 " + html.length + " 字符");
      }
    }
    const base = p ? ("已转译 " + esc(p.name) + " · " + html.length + " 字符 (HIC→HTML)") : "";
    let tail = "";
    el.statusbar.className = "statusbar" + (errs.length ? " err" : (warns.length ? " warn" : ""));
    if (errs.length || warns.length) {
      tail = " · ";
      if (errs.length) tail += '<span class="errcount" title="点击定位到错误" data-jump="err">✕ ' + errs.length + "</span> ";
      if (warns.length) tail += '<span class="warncount" title="点击定位到警告" data-jump="warn">⚠ ' + warns.length + "</span>";
    }
    if (el.sbLeft) el.sbLeft.innerHTML = base + tail;
    // 问题面板 + tab 徽标
    renderProblems(diags);
    renderVars();
    renderOutput();
  }
  function debounceSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      if (state.projId && state.pageId) {
        Store.updatePageCode(state.projId, state.pageId, el.code.value);
        el.crumb.textContent = (currentProj() ? currentProj().name : "") + " · " + (currentPage() ? currentPage().name : "") + "  ✓已保存";
      }
    }, 500);
  }
  function saveNow() {
    clearTimeout(state.saveTimer);
    if (state.projId && state.pageId && document.activeElement === el.code) {
      Store.updatePageCode(state.projId, state.pageId, el.code.value);
    }
  }

  /* ---- 问题面板 + 光标定位 ---- */
  let _probFilter = "all";
  function gotoLine(line) {
    if (!el.code || line < 1) return;
    const lines = el.code.value.split("\n");
    let pos = 0;
    for (let k = 0; k < Math.min(line - 1, lines.length); k++) pos += lines[k].length + 1;
    el.code.focus();
    el.code.setSelectionRange(pos, pos);
    if (window.hiced) { el.code.scrollTop = Math.max(0, (line - 4) * 23); window.hiced.render(); }
  }
  function renderProblems(diags) {
    diags = diags || HC.diagnose(el.code.value || "");
    const errs = diags.filter(function (d) { return d.level === "error"; });
    const warns = diags.filter(function (d) { return d.level === "warn"; });
    if (el.cntAll) el.cntAll.textContent = diags.length;
    if (el.cntErr) el.cntErr.textContent = errs.length;
    if (el.cntWarn) el.cntWarn.textContent = warns.length;
    if (el.probBadge) {
      el.probBadge.hidden = diags.length === 0;
      el.probBadge.textContent = diags.length;
    }
    const list = _probFilter === "error" ? errs : (_probFilter === "warn" ? warns : diags);
    if (el.probEmpty) el.probEmpty.hidden = list.length > 0;
    if (!el.probList) return;
    el.probList.innerHTML = list.map(function (d) {
      const isErr = d.level === "error";
      return ['<div class="prob-item ', isErr ? "err" : "warn", '" data-line="', d.line, '">',
        '<span class="pi-icon">', isErr ? "✕" : "⚠", '</span>',
        '<span class="pi-msg">', esc(d.msg || ""), '</span>',
        '<span class="pi-line">行 ', d.line, '</span>',
        "</div>"].join("");
    }).join("");
  }
  function updateCursorPos() {
    if (!el.sbRight) return;
    const ta = el.code;
    const s = ta.selectionStart;
    const upto = ta.value.slice(0, s);
    const line = upto.split("\n").length;
    const col = s - (upto.lastIndexOf("\n") + 1) + 1;
    el.sbRight.textContent = "行 " + line + ", 列 " + col + " · UTF-8 · LF · HIC";
  }

  /* ---- 输出面板：构建摘要 ---- */
  function renderOutput() {
    if (!el.outputList) return;
    const pg = currentPage();
    if (!pg) {
      el.outputList.innerHTML = '<div class="output-row"><span class="k">状态</span><span>未打开页面</span></div>';
      return;
    }
    const html = el.previewSrc.value || "";
    const diags = HC.diagnose(el.code.value || "");
    const errs = diags.filter(function (d) { return d.level === "error"; }).length;
    const warns = diags.filter(function (d) { return d.level === "warn"; }).length;
    let vars = {};
    try { vars = HC.processPage({ name: pg.name, code: el.code.value, images: Store.getPageImages(state.projId, state.pageId) }, {}).vars; } catch (e) {}
    const varc = Object.keys(vars).length;
    const ok = errs === 0;
    el.outputList.innerHTML = [
      '<div class="output-row"><span class="' + (ok ? "ok" : "err") + '">' + (ok ? "✓" : "✕") + ' 转译 ' + (ok ? "成功" : "发现错误") + '</span></div>',
      '<div class="output-row"><span class="k">生成 HTML</span><span>' + html.length + ' 字符</span></div>',
      '<div class="output-row"><span class="k">当前页面</span><span>' + esc(pg.name) + '</span></div>',
      '<div class="output-row"><span class="k">变量</span><span>' + varc + ' 个</span></div>',
      '<div class="output-row"><span class="k">诊断</span><span class="' + (errs ? "err" : "") + '">' + errs + ' 错误</span><span> · </span><span class="' + (warns ? "warn" : "") + '">' + warns + ' 警告</span></div>'
    ].join("");
  }

  /* ---- 控制台面板（终端风格活动日志） ---- */
  let _consoleLogs = [];
  let _consoleFilter = "all";
  let _diagSig = null;
  const CONSOLE_LABEL = { output: "输出", warning: "警告", error: "错误" };
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function logConsole(level, text) {
    const t = new Date();
    _consoleLogs.push({ level: level, text: text, time: pad2(t.getHours()) + ":" + pad2(t.getMinutes()) + ":" + pad2(t.getSeconds()) });
    if (_consoleLogs.length > 500) _consoleLogs.shift();
    renderConsole();
  }
  function renderConsole() {
    if (!el.consoleLog) return;
    const list = _consoleLogs.filter(function (l) {
      if (_consoleFilter === "all") return true;
      if (_consoleFilter === "output") return l.level === "output";
      return l.level === _consoleFilter;
    });
    if (!list.length) {
      const name = _consoleFilter === "all" ? "" : (_consoleFilter === "output" ? "输出" : CONSOLE_LABEL[_consoleFilter]);
      el.consoleLog.innerHTML = '<div class="console-empty">暂无' + name + '活动记录</div>';
      return;
    }
    el.consoleLog.innerHTML = list.map(function (l) {
      const cls = l.level === "error" ? "error" : (l.level === "warning" ? "warning" : "output");
      return '<div class="console-line ' + cls + '"><span class="cl-time">' + l.time + '</span><span class="cl-tag">' + CONSOLE_LABEL[l.level] + '</span><span class="cl-text">' + esc(l.text) + '</span></div>';
    }).join("");
  }

  /* ---- 变量面板 ---- */
  function renderVars() {
    const proj = currentProj(); const pg = currentPage();
    if (!proj || !pg) { el.varList.innerHTML = ""; el.varEmpty.hidden = false; return; }
    let vars = {};
    try { vars = HC.processPage({ name: pg.name, code: el.code.value, images: Store.getPageImages(proj.id, pg.id), files: Store.getPageFiles(proj.id, pg.id) }, {}).vars; } catch (e) {}
    const keys = Object.keys(vars);
    el.varEmpty.hidden = keys.length > 0;
    el.varList.innerHTML = keys.map(function (k) {
      const v = vars[k];
      if (v.type === "app") {
        // 可下载文件变量（it xxx app）
        const f = v.file || null;
        const val = f ? (f.name + (f.type ? " · " + f.type : "")) : "未上传文件";
        return ['<div class="var-row" data-vk="', esc(k), '" data-kind="app">',
          '<span class="vk" style="background:rgba(90,168,255,.22);color:#7cc0ff;">⬇</span>',
          '<div><div class="vn">', esc(k), '</div><div class="vt">文件 app（可下载）</div></div>',
          '<span class="val">', esc(String(val).slice(0, 40)), '</span>',
          '<span class="img-actions">',
          '<button type="button" class="primary" data-act="fup">', f ? "更换" : "上传", '</button>',
          f ? '<button type="button" class="danger" data-act="fdel">删除</button>' : '',
          '</span>',
          "</div>"].join("");
      }
      const typeLabel = v.isImg ? "图片 p" : (v.type === "text" ? "文字 t" : "普通");
      const img = v.isImg;
      const uploaded = img && v.value;
      return ['<div class="var-row" data-vk="', esc(k), '">',
        '<span class="vk">', esc(k), '</span>',
        img ? '<img class="thumb" src="' + esc(uploaded ? v.value : "") + '" alt=""' + (uploaded ? "" : " style=\"opacity:.22\"") + '/>'
          : '<span class="vt" style="color:var(--good)">' + (v.type === "text" ? "Txt" : "•") + '</span>',
        '<div><div class="vn">', esc(k), '</div><div class="vt">', typeLabel, '</div></div>',
        '<span class="val">', esc(String(v.value == null ? "" : v.value).slice(0, 40) || (uploaded ? "已上传图片" : "空")), '</span>',
        img ? ['<span class="img-actions">',
            '<button type="button" class="primary" data-act="up">', uploaded ? "更换" : "上传", '</button>',
            '<button type="button" class="ghost" data-act="url" title="填入图片 URL 直接引用">URL</button>',
            uploaded ? '<button type="button" class="danger" data-act="del">删除</button>' : '',
            '</span>'].join("")
          : '<span class="vt">$</span>',
        "</div>"].join("");
    }).join("");
  }
  function pickImage(varName) {
    state.pendingImgVar = varName;
    el.fileImg.value = "";
    el.fileImg.click();
  }
  function onFileImg() {
    const file = el.fileImg.files && el.fileImg.files[0];
    if (!file || !state.pendingImgVar) return;
    const reader = new FileReader();
    reader.onload = function () {
      Store.setPageImage(state.projId, state.pageId, state.pendingImgVar, reader.result);
      state.pendingImgVar = null;
      doLive();
    };
    reader.readAsDataURL(file);
  }
  function pickFile(varName) {
    state.pendingFileVar = varName;
    el.fileApp.value = "";
    el.fileApp.click();
  }
  function onFileApp() {
    const file = el.fileApp.files && el.fileApp.files[0];
    if (!file || !state.pendingFileVar) return;
    const reader = new FileReader();
    reader.onload = function () {
      Store.setPageFile(state.projId, state.pageId, state.pendingFileVar, {
        name: file.name,
        type: file.type || "",
        dataURL: reader.result
      });
      state.pendingFileVar = null;
      logConsole("output", "已为「" + file.name + "」上传为可下载文件");
      doLive();
    };
    reader.readAsDataURL(file);
  }
  function setImageUrl(varName) {
    modal(0, { title: "图片 URL", input: true, placeholder: "https://… 或 data:image/…", okText: "引用" }).then(function (url) {
      if (!url) { doLive(); return; }
      Store.setPageImage(state.projId, state.pageId, varName, url);
      doLive();
      setStatus("已把图片「" + varName + "」绑定到 URL");
    });
  }

  /* ---- 图形化画布：点击定位坐标 ---- */
  function onGraphClick(evt) {
    if (!el.graphCanvas) return;
    const rect = el.graphCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, Math.round(evt.clientX - rect.left)));
    const y = Math.max(0, Math.min(rect.height, Math.round(evt.clientY - rect.top)));
    state.graph.x = x; state.graph.y = y;
    if (el.graphCoord) el.graphCoord.textContent = "坐标：( " + x + " , " + y + " ) px";
    if (el.graphDot) {
      el.graphDot.hidden = false;
      el.graphDot.style.left = x + "px";
      el.graphDot.style.top = y + "px";
    }
  }
  function clearGraph() {
    state.graph.x = null; state.graph.y = null;
    if (el.graphCoord) el.graphCoord.textContent = "坐标：未选择（请在画布上点击）";
    if (el.graphDot) el.graphDot.hidden = true;
  }
  function insertAtCursor(text) {
    const ta = el.code;
    if (ta.selectionStart == null) { ta.value += text; return; }
    const s = ta.selectionStart, en = ta.selectionEnd;
    const before = ta.value.slice(0, s);
    const after = ta.value.slice(en);
    // 在光标处整齐换行插入
    const lead = before && !/\n$/.test(before) ? "\n" : "";
    const trail = after && !/^\n/.test(after) ? "\n" : "";
    const ins = lead + text + trail;
    ta.value = before + ins + after;
    const pos = s + lead.length + text.length;
    ta.selectionStart = ta.selectionEnd = pos;
    if (window.hiced) window.hiced.render();
    ta.focus();
  }
  function insertPointCode() {
    if (!state.projId || !state.pageId) { setStatus("请先打开一个页面"); return; }
    const name = (el.graphVarName && el.graphVarName.value ? el.graphVarName.value.trim() : "点A").trim();
    if (!HC.isName(name)) { setStatus("变量名不合法：需以字母/下划线/中文开头"); return; }
    if (state.graph.x == null || state.graph.y == null) { setStatus("请先在画布上点击确定坐标"); return; }
    const type = (el.graphType && el.graphType.value) || "text";
    const content = (el.graphContent && el.graphContent.value ? el.graphContent.value.trim() : "");
    const code = el.code.value || "";
    const lines = [];
    const hasDecl = new RegExp("(^|\\n)\\s*it\\s+" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(code);
    if (!hasDecl) lines.push(type === "img" ? "it " + name + " p" : "it " + name + " t" + (content ? " " + content : ""));
    lines.push(name + " in point " + Math.round(state.graph.x) + " " + Math.round(state.graph.y));
    insertAtCursor(lines.join("\n"));
    doLive(); debounceSave();
    setStatus("已插入坐标点 " + name + " → (" + Math.round(state.graph.x) + ", " + Math.round(state.graph.y) + ")");
  }

  /* ---- 新建/重命名/删除 ---- */
  function newProject() {
    modal(0, { title: "新建项目", input: true, placeholder: "项目名称", okText: "创建" }).then(function (name) {
      if (!name) return;
      const id = Store.createProject(name);
      openProject(id);
    });
  }
  function renameProject(id) {
    const p = Store.getProject(id); if (!p) return;
    modal(0, { title: "重命名项目", input: true, value: p.name, okText: "保存" }).then(function (name) {
      if (!name) return;
      Store.renameProject(id, name); renderAll();
    });
  }
  function deleteProject(id) {
    const p = Store.getProject(id); if (!p) return;
    modal(0, { title: "删除项目", body: '确定删除项目「' + esc(p.name) + '」及其全部页面吗？此操作不可恢复。', okText: "删除", cancelText: "取消" }).then(function (ok) {
      if (!ok) return;
      Store.deleteProject(id);
      if (state.projId === id) { state.projId = null; state.pageId = null; el.code.value = ""; el.crumb.textContent = "—"; }
      // 若无任何项目，回到首页
      if (!Store.hasAnyProject()) { setStatus("已无项目"); renderAll(); }
      else { const left = Store.listProjects(); openProject(left[0].id); }
    });
  }
  function newPage() {
    if (!state.projId) return;
    modal(0, { title: "新建页面", input: true, placeholder: "页面名称", value: "页面" + (Object.keys(currentProj().pages).length + 1), okText: "创建" }).then(function (name) {
      if (!name) return;
      const pid = Store.createPage(state.projId, name);
      openPage(pid);
    });
  }
  function renamePage(id) {
    const p = Store.getPage(state.projId, id); if (!p) return;
    modal(0, { title: "重命名页面", input: true, value: p.name, okText: "保存" }).then(function (name) {
      if (!name) return;
      Store.renamePage(state.projId, id, name); renderAll();
    });
  }
  function deletePage(id) {
    const p = Store.getPage(state.projId, id); if (!p) return;
    modal(0, { title: "删除页面", body: '确定删除页面「' + esc(p.name) + '」吗？', okText: "删除" }).then(function (ok) {
      if (!ok) return;
      Store.deletePage(state.projId, id);
      const proj = Store.getProject(state.projId);
      const left = Object.keys(proj.pages);
      if (!left.length) { state.pageId = null; el.code.value = ""; setStatus("该项目没有页面了，请新建一个"); }
      else openPage(left[0]);
      renderAll();
    });
  }

  /* ---- 导出 ---- */
  function allProjects() {
    return Store.listProjects().map(function (m) { return Store.getProject(m.id); });
  }
  function projectsMapOf(list) {
    const m = {};
    list.forEach(function (p) { m[p.name] = { slug: HC.slugify(p.name), pages: {} }; Object.keys(p.pages).forEach(function (pid) { m[p.name].pages[p.pages[pid].name] = true; }); });
    return m;
  }
  function exportHc() {
    const proj = currentProj(); if (!proj) return;
    const text = Store.exportHcProject(proj.id);
    HC.download(text, HC.slugify(proj.name) + ".hc");
    logConsole("output", "已导出 .hc 项目「" + proj.name + "」");
    toastOn("已导出 .hc", '项目「' + esc(proj.name) + '」已导出为 <b>' + esc(HC.slugify(proj.name)) + '.hc</b>，下次可直接导入继续开发。');
  }
  function exportSingle() {
    const proj = currentProj(); const pg = currentPage();
    if (!proj || !pg) return;
    if (HC.usesDownload(proj)) { warnZipOnly(); return; }
    const html = HC.buildSinglePageHtml(proj, pg);
    HC.download(html, HC.slugify(pg.name) + ".html");
    logConsole("output", "已导出单个页面「" + pg.name + "」为 .html");
  }
  function exportZip() {
    const list = allProjects(); if (!list.length) return;
    const entries = HC.buildZipEntries(list);
    // 普通页面条目用 .html；可下载文件(app)条目用 .data（二进制）
    const files = entries.map(function (e) { return { name: e.name, data: (e.data ? e.data : e.html) }; });
    const blob = new Blob([HC.zipFiles(files).buffer], { type: "application/zip" });
    HC.download(blob, "HiCode-export.zip");
    logConsole("output", "已导出 " + entries.length + " 个资源（含可下载文件）为 .zip");
    toastOn("已导出 .zip", "已将全部 " + entries.length + " 个页面/文件打包为 <b>HiCode-export.zip</b>。");
  }
  function warnZipOnly() {
    toastOn("仅支持 .zip 导出", '当前项目使用了可下载文件变量（<code>it 名 app</code> + <code>名 in d</code>）。为保证下载功能生效，请改用 <b>导出全部页面 · 打包 .zip</b>。');
  }
  function exportMerge() {
    const list = allProjects(); if (!list.length) return;
    for (let i = 0; i < list.length; i++) if (HC.usesDownload(list[i])) { warnZipOnly(); return; }
    const html = HC.buildAllMergedHtml(list, projectsMapOf(list));
    HC.download(html, "HiCode-merged.html");
    logConsole("output", "已导出全部项目为合并 .html");
    toastOn("已导出合并 .html", "全部项目已合并为一个 <b>HiCode-merged.html</b>，含顶部导航，可点击跳转各页面。");
  }

  /* ---- 导入 ---- */
  function startImport() {
    _importFileCb = "import";
    el.fileHc.value = "";
    el.fileHc.click();
  }
  function onFileHc() {
    const file = el.fileHc.files && el.fileHc.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = function () {
      const r = Store.importHc(String(rd.result));
      if (!r.ok) { toastOn("导入失败", '<span class="msg-bad">' + esc(r.error || "未知错误") + "</span>"); return; }
      openProject(r.projectId);
      // 跨项目提示
      const proj = Store.getProject(r.projectId);
      const refs = collectCrossRefs(proj);
      if (refs.missing && refs.missing.length) {
        toastOn("已导入 · 注意", "项目「" + esc(r.name) + "」已导入。<br/>检测到跨项目跳转指向：<b>" + esc(refs.missing.join("、")) + "</b>。请在同样导入相应项目后再导出，以保证跳转可点击。");
      } else {
        toastOn("导入成功", "项目「" + esc(r.name) + "」已导入并开始开发。");
      }
    };
    rd.readAsText(file, "utf-8");
  }
  function collectCrossRefs(proj) {
    const known = {};
    Store.listProjects().forEach(function (m) { known[m.name] = true; });
    const missing = [];
    Object.keys(proj.pages).forEach(function (pid) {
      try {
        const nodes = HC.parse(proj.pages[pid].code || "");
        (function walk(nds) {
          nds.forEach(function (n) {
            if (n.kind === "nav" && n.cross && !known[n.toProj]) missing.push(n.toProj);
            if (n.kind === "cond") { walk(n.body); n.chains.forEach(function (c) { walk(c.body); }); }
          });
        })(nodes);
      } catch (e) {}
    });
    return { missing: Array.from(new Set(missing)) };
  }

  /* ---- 实时转译新标签打开 ---- */
  function openPreviewNew() {
    const html = el.previewSrc.value || liveHtml();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  /* ---- 事件绑定 ---- */
  function bind() {
    $("homeNew").onclick = newProject;
    $("homeImport").onclick = startImport;
    $("homeResume").onclick = function () {
      const id = Store.lastProjectId(); if (id && Store.getProject(id)) openProject(id); else showHome();
    };
    $("btnHome").onclick = showHome;
    el.addProject.onclick = newProject;
    el.addPage.onclick = newPage;
    el.code.addEventListener("input", function () { doLive(); debounceSave(); });
    // 光标位置实时显示（行, 列）
    el.code.addEventListener("keyup", updateCursorPos);
    el.code.addEventListener("click", updateCursorPos);
    el.code.addEventListener("input", updateCursorPos);
    // 诊断计数点击跳转到首个错误/警告行
    el.statusbar.addEventListener("click", function (e) {
      const t = e.target && e.target.closest ? e.target.closest("[data-jump]") : null;
      if (!t) return;
      const level = t.getAttribute("data-jump") === "err" ? "error" : "warn";
      const diags = HC.diagnose(el.code.value || "");
      const hit = diags.find(function (d) { return d.level === level; });
      if (!hit || !el.code) return;
      const lines = el.code.value.split("\n");
      let pos = 0; for (let k = 0; k < hit.line - 1; k++) pos += lines[k].length + 1;
      el.code.focus();
      el.code.setSelectionRange(pos, pos);
      if (window.hiced) { el.code.scrollTop = (hit.line - 4) * 23; window.hiced.render(); }
    });
    el.btnLive.onclick = function () {
      doLive();
      document.querySelector('[data-tab="preview"]').click();
      setStatus("已实时转译当前页面");
    };
    // 顶部工作区 tab
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.onclick = function () {
        Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (x) { x.classList.remove("on"); });
        t.classList.add("on");
        Array.prototype.forEach.call(document.querySelectorAll(".pane"), function (p) { p.classList.remove("on"); });
        $("pane-" + t.getAttribute("data-tab")).classList.add("on");
        if (t.getAttribute("data-tab") === "preview") doLive();
      };
    });
    // 底部面板 tab（问题 / 输出 / 变量）
    Array.prototype.forEach.call(document.querySelectorAll(".btab"), function (t) {
      t.onclick = function () {
        Array.prototype.forEach.call(document.querySelectorAll(".btab"), function (x) { x.classList.remove("on"); });
        t.classList.add("on");
        Array.prototype.forEach.call(document.querySelectorAll(".bpane"), function (p) { p.classList.remove("on"); });
        $("bp-" + t.getAttribute("data-btab")).classList.add("on");
        if (t.getAttribute("data-btab") === "vars") renderVars();
        if (t.getAttribute("data-btab") === "problems") renderProblems();
        if (t.getAttribute("data-btab") === "output") renderOutput();
        if (t.getAttribute("data-btab") === "console") renderConsole();
      };
    });
    // 导出下拉
    el.btnExport.onclick = function () { el.exportMenu.classList.toggle("open"); };
    document.addEventListener("click", function (e) { if (!e.target.closest(".menu-wrap")) el.exportMenu.classList.remove("open"); });
    Array.prototype.forEach.call(el.exportMenu.querySelectorAll("button"), function (b) {
      b.onclick = function () {
        el.exportMenu.classList.remove("open");
        const act = b.getAttribute("data-act");
        if (act === "hc") exportHc();
        else if (act === "single") exportSingle();
        else if (act === "zip") exportZip();
        else if (act === "merge") exportMerge();
      };
    });
    el.fileImg.onchange = onFileImg;
    el.fileHc.onchange = onFileHc;
    el.openPreview.onclick = openPreviewNew;
    // 预览 ⇄ 源码 切换
    el.btnToggleSrc.onclick = function () {
      const showSrc = el.previewSrc.hidden;
      el.previewSrc.hidden = !showSrc;
      el.previewFrame.hidden = showSrc;
      if (showSrc) el.previewSrc.value = el.previewSrc.value || liveHtml();
      el.btnToggleSrc.textContent = showSrc ? "预览效果" : "查看源码";
    };
    // 问题面板：过滤切换
    el.probFilter.addEventListener("click", function (e) {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      _probFilter = b.getAttribute("data-f");
      Array.prototype.forEach.call(el.probFilter.querySelectorAll("button"), function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      renderProblems();
    });
    // 控制台：过滤切换 + 清空
    if (el.consoleFilter) el.consoleFilter.addEventListener("click", function (e) {
      const b = e.target.closest("[data-cf]");
      if (!b) return;
      _consoleFilter = b.getAttribute("data-cf");
      Array.prototype.forEach.call(el.consoleFilter.querySelectorAll("button"), function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      renderConsole();
    });
    if (el.btnClearConsole) el.btnClearConsole.onclick = function () {
      _consoleLogs = [];
      renderConsole();
    };
    // 问题面板：点击条目跳转到对应行
    el.probList.addEventListener("click", function (e) {
      const item = e.target.closest(".prob-item");
      if (!item) return;
      gotoLine(parseInt(item.getAttribute("data-line"), 10) || 1);
    });
    // 变量面板：事件委托处理图片上传/删除（保证每次重渲染后按钮始终可用）
    el.varList.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      const row = btn.closest(".var-row");
      if (!row) return;
      const k = row.getAttribute("data-vk");
      const act = btn.getAttribute("data-act");
      if (act === "up") pickImage(k);
      else if (act === "del") { Store.setPageImage(state.projId, state.pageId, k, null); doLive(); }
      else if (act === "url") setImageUrl(k);
      else if (act === "fup") pickFile(k);
      else if (act === "fdel") { Store.setPageFile(state.projId, state.pageId, k, null); doLive(); }
    });
    // 可下载文件上传
    el.fileApp.onchange = onFileApp;
    // 快捷代码片段：触发区域 / use / 下载文件
    Array.prototype.forEach.call(document.querySelectorAll(".snippet"), function (b) {
      b.onclick = function () {
        const snip = b.getAttribute("data-snip");
        const code = el.code, s = code.selectionStart;
        if (snip === "region") {
          insertAtCursor("cf 区域A\n    it 提示 t 点击我试试\n    提示 in t\ncf 区域A stop");
        } else if (snip === "use") {
          insertAtCursor("use math, time, json\n# use 标准库：网页输出为标识占位，打包/后端运行时可用");
        } else if (snip === "app") {
          insertAtCursor("it 下载包 app\n下载包 in d");
        }
        doLive(); debounceSave();
      };
    });
    // 图形化画布
    if (el.graphCanvas) el.graphCanvas.addEventListener("click", onGraphClick);
    if (el.btnInsertPoint) el.btnInsertPoint.onclick = insertPointCode;
    if (el.btnClearGraph) el.btnClearGraph.onclick = clearGraph;
  }

  /* ---- 启动 ---- */
  function boot() {
    bind();
    // 轻量编辑器：语法高亮 + 行号 + 自动缩进 + 括号补全
    if (window.HICED) window.hiced = HICED.create(el.code);
    logConsole("output", "HiCode IDE 已启动 · 就绪");
    if (!Store.hasAnyProject()) { showHome(); return; }
    showHome(); // 默认先回首页引导；也可自动恢复
  }
  boot();
})();