{
  "app": "Simple",
  "language": "SIMPLE",
  "format": "hc-project",
  "version": "v3.88",
  "project": {
    "id": "ch18-loops.hc",
    "name": "第18章 循环与控制流",
    "createdAt": 0,
    "updatedAt": 0,
    "pages": {
      "p1": {
        "id": "p1",
        "name": "while 循环 + break/continue",
        "code": "// 第18章 · 循环与控制流 练习文件\n//\n// 导入到网页端 / 三版均可运行\n\n// ① 基本 while 循环\nit 标题 t 循环与控制流 v3.88\n标题 in t\n\nset count = 0\nwhile count < 5:\n    say 第 {count} 次\n    count add 1\n\n// ② break / continue\nit 演示 b Continue & Break\n演示 b\n\nlet i be 0\nwhile i < 10:\n    i add 1\n    if i == 3: continue\n    if i == 7: break\n    say 输出 {i}\n\n// ③ set / let + add / sub / mul / div\nit 简写演示 b\n简写演示 b\n\nlet a be 10\nlet b be 3\nset a = a add 5   // a = 15\nb sub 1            // b = 2\na mul b            // a = 30\ndiv 3              // a = 10\nsay a = {a}  b = {b}\n\n// ④ 列表 / 字典\nit 数据结构 b\n数据结构 b\n\nset nums = [10, 20, 30, 40, 50]\nset info = {name: Simple, ver: v3.88}\nsay 列表 {nums}，长度 {len(nums)}\nsay 字典 {info.name} / {info.ver}\nif 20 in nums:\n    say ✅ 20 在列表里",
        "images": {}
      }
    }
  }
}