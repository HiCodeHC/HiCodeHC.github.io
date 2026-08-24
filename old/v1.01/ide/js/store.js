/* ============================================================
 * HC v1.00 —— 数据层 store.js
 * 职责：
 *   1) 项目 / 页面 CRUD，localStorage 本地持久化
 *   2) 首次零项目引导判定（hasAnyProject / lastActive）
 *   3) .hc 文件导出 / 导入
 * 数据形态（localStorage 键：HICODE_DATA）：
 *   {
 *     projects: { <projId>: { id, name, createdAt, updatedAt,
 *                    pages: { <pageId>: { id, name, code,
 *                                images: { <varName>: dataURL } } } } },
 *     lastProjectId, lastPageId
 *   }
 * 图片以 dataURL 内嵌进项目数据，随 .hc 一并保存。
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.Store = api;
})(typeof self !== "undefined" ? self : null, function () {
  "use strict";

  const KEY = "HICODE_DATA";
  const STORE_VERSION = "v1.00";

  function uuid() {
    return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function now() { return Date.now(); }

  function emptyData() {
    return { projects: {}, lastProjectId: null, lastPageId: null };
  }

  // 严格在浏览器可用时读写 localStorage；非浏览器环境退化为内存态，便于测试
  let _mem = null;
  function hasLS() {
    try { return typeof localStorage !== "undefined" && !!localStorage; } catch (e) { return false; }
  }
  function load() {
    if (!hasLS()) return (_mem ? JSON.parse(JSON.stringify(_mem)) : emptyData());
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyData();
      const d = JSON.parse(raw);
      if (!d || typeof d.projects !== "object") return emptyData();
      return d;
    } catch (e) { return emptyData(); }
  }
  function save(d) {
    if (!hasLS()) { _mem = JSON.parse(JSON.stringify(d)); return; }
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 容量超限忽略 */ }
  }
  function reset() {
    if (hasLS()) { try { localStorage.removeItem(KEY); } catch (e) {} }
    _mem = emptyData();
  }

  // ---- 项目 ----
  function getProject(id) {
    const d = load();
    const p = d.projects && d.projects[id];
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }
  function listProjects() {
    const d = load();
    return Object.keys(d.projects || {}).map(function (id) {
      const p = d.projects[id];
      return { id: p.id, name: p.name, pageCount: Object.keys(p.pages).length, createdAt: p.createdAt, updatedAt: p.updatedAt };
    });
  }
  function getProjectByPage(pageId) {
    const d = load();
    for (const id in d.projects) {
      if (Object.prototype.hasOwnProperty.call(d.projects[id].pages, pageId)) return JSON.parse(JSON.stringify(d.projects[id]));
    }
    return null;
  }
  // createProject(name, withDefaultPage=true) -> {id}
  function createProject(name, withDefaultPage) {
    const d = load();
    const id = uuid();
    const pages = {};
    if (withDefaultPage !== false) {
      const pid = uuid();
      pages[pid] = { id: pid, name: "页面1", code: "", images: {} };
      d.lastPageId = pid;
    }
    d.projects[id] = { id, name: safeName(name, "项目"), createdAt: now(), updatedAt: now(), pages };
    d.lastProjectId = id;
    save(d);
    return id;
  }
  function renameProject(id, name) {
    const d = load();
    if (!d.projects[id]) return false;
    d.projects[id].name = safeName(name, "项目");
    d.projects[id].updatedAt = now();
    save(d);
    return true;
  }
  function deleteProject(id) {
    const d = load();
    if (!d.projects[id]) return false;
    delete d.projects[id];
    if (d.lastProjectId === id) d.lastProjectId = null;
    save(d);
    return true;
  }

  // ---- 页面 ----
  function createPage(projId, name) {
    const d = load();
    if (!d.projects[projId]) return null;
    const pid = uuid();
    d.projects[projId].pages[pid] = { id: pid, name: safeName(name, "页面1"), code: "", images: {} };
    d.projects[projId].updatedAt = now();
    d.lastPageId = pid;
    save(d);
    return pid;
  }
  function getPage(projId, pageId) {
    const d = load();
    const p = d.projects[projId] && d.projects[projId].pages[pageId];
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }
  function renamePage(projId, pageId, name) {
    const d = load();
    const p = d.projects[projId] && d.projects[projId].pages[pageId];
    if (!p) return false;
    p.name = safeName(name, "页面");
    d.projects[projId].updatedAt = now();
    save(d);
    return true;
  }
  function deletePage(projId, pageId) {
    const d = load();
    if (!d.projects[projId] || !d.projects[projId].pages[pageId]) return false;
    delete d.projects[projId].pages[pageId];
    d.projects[projId].updatedAt = now();
    if (d.lastPageId === pageId) {
      const left = Object.keys(d.projects[projId].pages);
      d.lastPageId = left.length ? left[0] : null;
    }
    save(d);
    return true;
  }
  // updatePageCode(projId, pageId, code)
  function updatePageCode(projId, pageId, code) {
    const d = load();
    const p = d.projects[projId] && d.projects[projId].pages[pageId];
    if (!p) return false;
    p.code = code;
    d.projects[projId].updatedAt = now();
    save(d);
    return true;
  }
  // setPageImage(projId, pageId, varName, dataURL) ：绑定「it xxx p」的图片
  function setPageImage(projId, pageId, varName, dataURL) {
    const d = load();
    const p = d.projects[projId] && d.projects[projId].pages[pageId];
    if (!p) return false;
    if (!p.images) p.images = {};
    if (dataURL == null) delete p.images[varName]; else p.images[varName] = dataURL;
    d.projects[projId].updatedAt = now();
    save(d);
    return true;
  }
  function getPageImages(projId, pageId) {
    const d = load();
    const p = d.projects[projId] && d.projects[projId].pages[pageId];
    return (p && p.images) ? JSON.parse(JSON.stringify(p.images)) : {};
  }

  // ---- 最近活动（首屏引导定位） ----
  function lastProjectId() { return load().lastProjectId || null; }
  function lastPageId() { return load().lastPageId || null; }
  function hasAnyProject() { return Object.keys(load().projects).length > 0; }
  function setActive(projId, pageId) {
    const d = load();
    d.lastProjectId = projId || d.lastProjectId;
    if (pageId) d.lastPageId = pageId;
    save(d);
  }

  // ---- .hc 导出 / 导入 ----
  // 导出单个项目（含全部页面与内嵌图片）为 .hc 文件文本
  function exportHcProject(projId) {
    const p = getProject(projId);
    if (!p) return null;
    return JSON.stringify({
      app: "HiCode", language: "HIC", format: "hc-project", version: STORE_VERSION,
      project: p
    }, null, 2);
  }
  function importHc(text) {
    // 返回 { ok, error?, projectId?, name? }
    try {
      const obj = JSON.parse(text);
      if (!obj || obj.app !== "HiCode" || !obj.project) return { ok: false, error: "不是有效的 .hc 文件（缺少 HiCode 标记）" };
      const proj = obj.project;
      if (!proj || !proj.name || typeof proj.pages !== "object") return { ok: false, error: ".hc 文件内容不完整" };
      const d = load();
      // 同名覆盖策略：同名则新建一个带序号的名字，避免冲突
      const names = Object.keys(d.projects).map(function (id) { return d.projects[id].name; });
      let name = proj.name;
      if (names.indexOf(name) >= 0) {
        let n = 2;
        while (names.indexOf(name + "_" + n) >= 0) n++;
        name = name + "_" + n;
      }
      const id = uuid();
      d.projects[id] = { id, name, createdAt: now(), updatedAt: now(), pages: {} };
      Object.keys(proj.pages).forEach(function (pid) {
        const src = proj.pages[pid];
        const nid = uuid();
        d.projects[id].pages[nid] = {
          id: nid, name: src.name || "页面", code: src.code || "",
          images: (src.images && typeof src.images === "object") ? JSON.parse(JSON.stringify(src.images)) : {}
        };
      });
      d.lastProjectId = id;
      save(d);
      return { ok: true, projectId: id, name };
    } catch (e) {
      return { ok: false, error: "解析失败：" + e.message };
    }
  }

  function safeName(name, fallback) {
    const s = String(name == null ? "" : name).trim();
    return s ? s : fallback;
  }

  return {
    STORE_VERSION, KEY,
    uuid, now, load, save, reset,
    getProject, listProjects, getProjectByPage, createProject, renameProject, deleteProject,
    createPage, getPage, renamePage, deletePage, updatePageCode, setPageImage, getPageImages,
    loadNewData: emptyData,
    lastProjectId, lastPageId, hasAnyProject, setActive,
    exportHcProject, importHc
  };
});