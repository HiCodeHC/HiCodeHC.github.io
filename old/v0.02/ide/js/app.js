/* ============================================================
 * HC v0.02 在线 IDE —— 界面逻辑 app.js
 * 依赖：Store (store.js) + HC (hic.js)
 * 职责：首页引导、项目/页面 CRUD、代码编辑、实时转译预览、
 *       变量面板（含 p 图片上传）、导出菜单。
 * ============================================================ */
(function () {
  "use strict";

  /* ---- 状态 ---- */
  let state = { projId: null, pageId: null, pendingImgVar: null, saveTimer: null };
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
    crumb: $("crumb"),
    statusbar: $("statusbar"),
    previewFrame: $("previewFrame"),
    previewSrc: $("previewSrc"),
    varList: $("varList"),
    varEmpty: $("varEmpty"),
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
    openPreview: $("openPreview")
  };

  /* ---- 工具 ---- */
  function esc(s) { return HC.esc(s); }

  function currentProj() { return state.projId ? Store.getProject(state.projId) : null; }
  function currentPage() {
    if (!state.projId || !state.pageId) return null;
    return Store.getPage(state.projId, state.pageId);
  }

  function setStatus(msg) {
    el.statusbar.textContent = msg || "";
  }
  function toastOn(title, body) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = body;
    $("modalCancel").textContent = "确定";
    $("modalOk").classList.add("hidden");
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
      $("btnLive").classList.remove("hidden");
      return;
    }
    const proj = currentProj();
    el.crumb.textContent = proj.name + " · " + pg.name;
    el.code.value = pg.code;
    el.code.disabled = false;
    doLive();
  }
  function renderOpenContent() {
    const pg = currentPage();
    if (pg && el.code.value !== pg.code && document.activeElement !== el.code) {
      // 仅在非输入焦点时同步回显，避免打断输入
    }
  }

  /* ---- 实时转译 ---- */
  function liveHtml() {
    const proj = currentProj(); const pg = currentPage();
    if (!proj || !pg) return "<p>请先打开一个页面</p>";
    try { return HC.buildSinglePageHtml(proj, pg); }
    catch (e) { return "<pre>转译出错：" + esc(e.message) + "</pre>"; }
  }
  function doLive() {
    if (!state.projId || !state.pageId) { setStatus("未打开页面"); return; }
    const html = liveHtml();
    el.previewSrc.value = html;
    el.previewFrame.srcdoc = html;
    const p = currentPage();
    setStatus(p ? ("已转译 " + p.name + " 共 " + html.length + " 字符 (HIC → HTML)") : "");
    renderVars();
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

  /* ---- 变量面板 ---- */
  function renderVars() {
    const proj = currentProj(); const pg = currentPage();
    const needThumb = function (v) { return v.isImg; };
    if (!proj || !pg) { el.varList.innerHTML = ""; el.varEmpty.hidden = false; return; }
    let vars = {};
    try { vars = HC.processPage({ name: pg.name, code: el.code.value, images: Store.getPageImages(proj.id, pg.id) }, {}).vars; } catch (e) {}
    const keys = Object.keys(vars);
    el.varEmpty.hidden = keys.length > 0;
    el.varList.innerHTML = keys.map(function (k) {
      const v = vars[k];
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
            '<button class="primary" data-act="up">', uploaded ? "更换" : "上传", '</button>',
            uploaded ? '<button class="danger" data-act="del">删除</button>' : '',
            '</span>'].join("")
          : '<span class="vt">$</span>',
        "</div>"].join("");
    }).join("");
    Array.prototype.forEach.call(el.varList.querySelectorAll(".var-row"), function (row) {
      const imgBtns = row.querySelectorAll("[data-act]");
      Array.prototype.forEach.call(imgBtns, function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          const k = row.getAttribute("data-vk");
          if (b.getAttribute("data-act") === "up") pickImage(k);
          else if (b.getAttribute("data-act") === "del") {
            Store.setPageImage(state.projId, state.pageId, k, null); doLive();
          }
        };
      });
    });
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
    toastOn("已导出 .hc", '项目「' + esc(proj.name) + '」已导出为 <b>' + esc(HC.slugify(proj.name)) + '.hc</b>，下次可直接导入继续开发。');
  }
  function exportSingle() {
    const proj = currentProj(); const pg = currentPage();
    if (!proj || !pg) return;
    const html = HC.buildSinglePageHtml(proj, pg);
    HC.download(html, HC.slugify(pg.name) + ".html");
  }
  function exportZip() {
    const list = allProjects(); if (!list.length) return;
    const entries = HC.buildZipEntries(list);
    const blob = new Blob([HC.zipFiles(entries.map(function (e) { return { name: e.name, data: e.html }; })).buffer], { type: "application/zip" });
    HC.download(blob, "HiCode-export.zip");
    toastOn("已导出 .zip", "已将全部 " + entries.length + " 个页面打包为 <b>HiCode-export.zip</b>。");
  }
  function exportMerge() {
    const list = allProjects(); if (!list.length) return;
    const html = HC.buildAllMergedHtml(list, projectsMapOf(list));
    HC.download(html, "HiCode-merged.html");
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
      if (refs.missing) {
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
    el.code.addEventListener("keydown", function (e) {
      if (e.key === "Tab") { e.preventDefault(); const s = el.code.selectionStart, en = el.code.selectionEnd; el.code.value = el.code.value.slice(0, s) + "  " + el.code.value.slice(en); el.code.selectionStart = el.code.selectionEnd = s + 2; }
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
        if (t.getAttribute("data-tab") === "vars") renderVars();
        if (t.getAttribute("data-tab") === "preview") doLive();
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
  }

  /* ---- 启动 ---- */
  function boot() {
    bind();
    if (!Store.hasAnyProject()) { showHome(); return; }
    showHome(); // 默认先回首页引导；也可自动恢复
  }
  boot();
})();