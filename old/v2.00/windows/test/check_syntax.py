# 语法检查：用嵌入式 V8 编译三个 JS 文件。
# 若抛出的是 SyntaxError -> 语法错误；若是 ReferenceError/TypeError(缺 document/window/localStorage)
# 则视为「语法正确、仅因无浏览器环境」，计入 OK。
import io
from py_mini_racer import MiniRacer

files = [r"D:\hicode-ide\js\store.js", r"D:\hicode-ide\js\hic.js", r"D:\hicode-ide\js\app.js"]

ok = True
mr = MiniRacer()
# 提供浏览器占位，避免 store.js 顶层立即崩溃（hasLS 已内置 try，但给全些安全）
mr.eval("var window=this; var self=this;")

for path in files:
    with io.open(path, "r", encoding="utf-8") as f:
        src = f.read()
    try:
        mr.eval(src)
        print("OK        ", path)
    except Exception as e:
        msg = str(e)
        if "SyntaxError" in msg:
            print("SYNTAX ERR", path, "->", msg[:200]); ok = False
        else:
            # 运行时环境错误（缺 DOM）视为语法通过
            print("OK(env)   ", path, "->", msg[:120])

print("RESULT:", "PASS" if ok else "FAIL")
import sys; sys.exit(0 if ok else 1)