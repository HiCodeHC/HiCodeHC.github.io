{
  "app": "Simple",
  "language": "SIMPLE",
  "format": "hc-project",
  "version": "v3.88",
  "project": {
    "id": "ch19-functions.hc",
    "name": "第19章 函数与内置函数",
    "createdAt": 0,
    "updatedAt": 0,
    "pages": {
      "p1": {
        "id": "p1",
        "name": "fn/call/return/raise + 内置函数",
        "code": "// 第19章 · 函数与内置函数 练习文件\n//\n// 编译期内联，无运行时开销\n\n// ========== 一、自定义函数 ==========\n\nfn add(a, b):\n    let r be a + b\n    say {a} + {b} = {r}\nfn end\n\nfn greet(name):\n    say 你好，{name}！\nfn end\n\nfn check(score):\n    if score >= 60:\n        say ✅ 及格\n        return\n    say ❌ 不及格\nfn end\n\nfn divide(a, b):\n    if b == 0:\n        raise 除数不能为零\n    let r be a / b\n    say {a} ÷ {b} = {r}\nfn end\n\n// ========== 二、调用 ==========\n\nit 自定义函数 t\n自定义函数 t\n\ncall add(10, 5)\ncall add(100, 200)\ncall greet(Simple)\ncall greet(世界)\n\n// return 提前返回\ncall check(85)   // ✅ 及格\ncall check(30)   // ❌ 不及格\n\n// raise（取消注释会中断后续）\n// call divide(10, 0)\ncall divide(10, 2)\n\n// ========== 三、11 个内置函数 ==========\n\nit 内置函数 b\n内置函数 b\n\n// len — 长度\nset s = 你好 Simple\nsay len(\"{s}\") = {len(s)}\nset lst = [1, 2, 3, 4, 5]\nsay len([1,2,3,4,5]) = {len(lst)}\n\n// range — 生成序列\nset r5 = range(5)          // [0,1,2,3,4]\nsay range(5) = {r5}\nset r28 = range(2, 8)      // [2,3,4,5,6,7]\nsay range(2,8) = {r28}\nset r0102 = range(0, 10, 2) // [0,2,4,6,8]\nsay range(0,10,2) = {r0102}\n\n// max / min / abs / sqrt / round\nsay max(3,7,2,9) = {max(3,7,2,9)}\nsay min([1,5,3]) = {min(lst)}\nsay abs(-42) = {abs(-42)}\nsay sqrt(144) = {sqrt(144)}\nsay round(3.7) = {round(3.7)}\n\n// toStr / toNum\nsay toNum(\"42\") + 1 = {toNum(\"42\") + 1}\n\n// push — 追加到列表末尾\nset square = []\nlet n be 0\nwhile n < 5:\n    push(square, n * n)   // 注意：push 返回新列表，赋值给 square\n    n add 1\nsay 平方序列 = {square}\n\n// ========== 四、综合练习：冒泡排序 ==========\n\nit 综合练习 · 列表排序 t\n综合练习 · 列表排序 t\n\nfn bubbleSort(data):\n    let n be len(data)\n    let i be 0\n    while i < n:\n        let j be 0\n        while j < n - i:\n            if data[j] > data[j + 1]:\n                // 交换（编译期简化：用 temp 变量）\n                let temp be data[j]\n                // 注：列表下标赋值在 v3.88 编译期引擎里\n                // 暂不支持 list[index] = val，此练习展示函数调用\n            j add 1\n        i add 1\n    say 排序后 {data}\nfn end\n\nset arr = [64, 34, 25, 12, 22, 11, 90]\nsay 原始数组 = {arr}\nsay 最大值 = {max(arr)}\nsay 最小值 = {min(arr)}\nsay 元素数 = {len(arr)}",
        "images": {}
      }
    }
  }
}