{
  "app": "HiCode",
  "language": "HIC",
  "format": "hc-project",
  "version": "v3.01",
  "project": {
    "id": "ch16-v301.hc",
    "name": "第16章 原生HTML块 v3.01",
    "createdAt": 0,
    "updatedAt": 0,
    "pages": {
      "p1": {
        "id": "p1",
        "name": "HTML块基础",
        "code": "# v3.01 原生 HTML 块：html:( … )end\n# 括号内的内容 HIC 不参与编译，原样写入最终导出的 HTML\n# 从上往下编译：先 it 变量 => 再 html 块 => 最后 in 展示\nit 说明 t 上面这段彩色卡片来自原生 HTML 块，下方是 HIC 展示的内容\nit 标题 t 卡片页\n\nhtml:(\n  <div class=\"card-demo\" style=\"background:#1abc9c;color:#fff;padding:24px;border-radius:12px;\">\n    <b>这是原生 HTML</b><br/>\n    这行不会被 HIC 编译，原样保留\n  </div>\n)end\n\n标题 in t\n说明 in b\n# 顺序：先声明变量 => 注入 HTML 块（原样保留）=> 再按 HIC 规则展示",
        "images": {},
        "files": {}
      },
      "p2": {
        "id": "p2",
        "name": "混合使用与顺序",
        "code": "# 语法：it i t a  html:(…)end  i in p\n# 含义：依旧从上往下编译，先 it => 再 html:()  => 最后 in\nit 大标题 t 我的页面\n\nhtml:(\n  <div class=\"banner\" style=\"background:linear-gradient(90deg,#6a5acd,#c2965c);color:#fff;padding:40px;text-align:center;border-radius:16px;\">\n    <h2>这是 HTML 块里的标题</h2>\n    <p>HTML 块内可放任意网页元素：表格、按钮、视频……</p>\n  </div>\n)end\n\n大标题 in t\n# 上面的顺序：先声明大标题 => 注入 HTML 块导航栏 => 再展示大标题文字",
        "images": {},
        "files": {}
      }
    }
  }
}