{
  "app": "Simple",
  "language": "SIMPLE",
  "format": "hc-project",
  "version": "v3.88",
  "project": {
    "id": "ch20-input.hc",
    "name": "第20章 sru 输入框",
    "createdAt": 0,
    "updatedAt": 0,
    "pages": {
      "p1": {
        "id": "p1",
        "name": "sru 输入框各种用法",
        "code": "// 第20章 · sru 用户输入 练习文件\n\nit 标题 t sru 输入演示 v3.88\n标题 in t\n\n// ① 最简写法 — 默认 100% 宽度 / 自动 / 圆角\nsru = name\nsay 你好，{name}！\n\n// ② 指定宽度 80%\nsru(80) = city\nsay 你住在 {city}\n\n// ③ confirm 手动载入 + 直角\nit 手动输入 t\nsru(100), t, f = password\npassword in t\n\n// ④ live 实时输入\nsru(60), f, y = search\nsay 实时搜索：{search}\n\n// ⑤ 两个输入框做加法\nit 计算器 t\nset n1 = 0\nset n2 = 0\nsru(40), f, y = a\nsru(40), f, y = b\nsay {a} + {b} = {int(a) + int(b)}",
        "images": {}
      }
    }
  }
}