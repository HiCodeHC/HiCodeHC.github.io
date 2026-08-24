{
  "app": "HiCode",
  "language": "HIC",
  "format": "hc-project",
  "version": "v2.00",
  "project": {
    "id": "ch15-v200.hc",
    "name": "第15章 图形化前端开发 v2.00",
    "createdAt": 0,
    "updatedAt": 0,
    "pages": {
      "p1": {
        "id": "p1",
        "name": "触发区域",
        "code": "use math, time\n# v2.00 触发区域：cf 名 … cf 名 stop\n# 点击色块，或长按约 0.6 秒，即可触发/展开该段代码\nit 欢迎 t 我的第一个图形化应用\n欢迎 in t\ncf 卡1\n    it 提示 t 点击我试试\n    it 副提示 t 长按也能触发哦\n    提示 in s\n    副提示 in b\ncf 卡1 stop\ncf 卡2\n    it 算式 t 圆周率 ≈ 3.14159\n    算式 in b\ncf 卡2 stop",
        "images": {},
        "files": {}
      },
      "p2": {
        "id": "p2",
        "name": "URL图片与下载",
        "code": "it 徽标 p https://picsum.photos/400/300\n徽标 in p\n# 可下载文件：it 名 app 声明 + 名 in d 触发下载\n# 导出时请使用「打包 .zip」（使用了下载功能仅支持 .zip）\nit 安装包 app\n安装包 in d",
        "images": {},
        "files": {}
      }
    }
  }
}