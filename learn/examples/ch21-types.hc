{
  "app": "Simple",
  "language": "SIMPLE",
  "format": "hc-project",
  "version": "v3.88",
  "project": {
    "id": "ch21-types.hc",
    "name": "第21章 类型转换 int/double/str",
    "createdAt": 0,
    "updatedAt": 0,
    "pages": {
      "p1": {
        "id": "p1",
        "name": "三个类型转换函数",
        "code": "// 第21章 · int / double / str 类型转换\n\nit 类型转换 t v3.88\n类型转换 t\n\n// ========== 一、int() ==========\nset a = int(42.9)\nsay int(42.9) = {a}\n\nset b = int(\"-99\")\nsay int(\"-99\") = {b}\n\n// ========== 二、double() ==========\nset pi = double(\"3.14159\")\nsay double(\"3.14159\") = {pi}\n\nlet half be double(1) / 2\nsay 1 / 2 = {half}\n\n// ========== 三、str() ==========\nset note = str(42) + \" 分\"\nsay str(42) + \"分\" = {note}\n\n// ========== 四、和 sru 配合 ==========\nit BMI 计算器 b\nBMI 计算器 b\n\nsru(50), f, y = heightCm\nsru(50), f, y = weightKg\n\nlet h be double(heightCm) / 100\nlet w be double(weightKg)\nset bmi = w / (h * h)\nsay 身高 {h}m，体重 {w}kg → BMI = {round(bmi)}\n\n// ========== 五、综合：打分器 ==========\nit 打分器 b\nsru(60), t, y = scoreRaw\nset score = double(scoreRaw)\nif score >= 90:\n    say 等级 A\nif score >= 60 and score < 90:\n    say 等级 B\nif score < 60:\n    say 等级 C\nsay 百分制 {score}，等级已判断",
        "images": {}
      }
    }
  }
}