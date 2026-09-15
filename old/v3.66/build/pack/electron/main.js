const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");

app.setName("HiCode");
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 860,
    minHeight: 600,
    autoHideMenuBar: true,
    title: "HiCode",
    backgroundColor: "#171310",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  });

  const index = path.join(__dirname, "index.html");
  if (fs.existsSync(index)) {
    win.loadFile(index);
  } else {
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent("<h1 style='font-family:sans-serif;color:#d9ae6b'>HiCode 未找到页面文件：index.html</h1>"));
  }

  // 预览 iframe 打开外部链接时用系统浏览器，不嵌套
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => { win = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });