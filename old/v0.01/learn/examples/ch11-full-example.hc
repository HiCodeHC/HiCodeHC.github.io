{
  "app": "HiCode",
  "language": "HIC",
  "format": "hc-project",
  "version": "v0.01",
  "project": {
    "id": "ch11-full-example.hc",
    "name": "第11章 完整案例：个人名片",
    "createdAt": 0,
    "updatedAt": 0,
    "pages": {
      "p1": {
        "id": "p1",
        "name": "名片",
        "code": "it 姓名 t 张三\nit 简介 t 一名热爱编程的初学者\nit 头像 p\nit 年龄 int 20\n\n姓名 in t\n简介 in t\n头像 in p\n\nif 年龄 >= 18:\n    成年人 in t\nnoif:\n    未成年人 in t\n\nto 联系方式",
        "images": {}
      },
      "p2": {
        "id": "p2",
        "name": "联系方式",
        "code": "it 邮箱 t zhang@example.com\n邮箱 in t\n\nto 名片",
        "images": {}
      }
    }
  }
}