const HC = require("/workspace/repo/ide/js/hic.js");

// 1) 生成含 py 块与 cpp 块的导出页
const page = {
  name: "demo",
  code: [
    "it t1 t 演示",
    "py:(",
    "  def hi(name):",
    "      return 'Hello, ' + name",
    "  # 注释：不应被当作 HIC 备注",
    "  print('py-开始')",
    "  for i in range(3):",
    "      print('n=', i)",
    "  if 2 > 1 and 3 > 2:",
    "      print(hi('HIC'))",
    ")end",
    "cpp:(",
    "  #include <iostream>",
    "  using namespace std;",
    "  int main() {",
    "      int n = 3;",
    "      cout << \"cpp-结果\" << n;",
    "      for (int i=0;i<3;i++) cout << \"I\" << i;",
    "      return 0;",
    "  }",
    ")end",
    "t1 in t"
  ].join("\n"),
  images: {}, files: {}
};

const html = HC.buildSinglePageHtml({ name: "我的项目" }, page);

for (const bad of ["pyodide", "jsdelivr", "loadPyodide", "github.io", "cdn.jsdelivr", "https://cdn"]) {
  if (html.indexOf(bad) >= 0) {
    console.log("✗ 仍引用外部官方库/CDN: " + bad);
    process.exit(1);
  }
}
console.log("✓ 导出页不引用任何外部官方库 / CDN / 网址");
if (html.indexOf("pyToJs") < 0 || html.indexOf("cppToJs") < 0) {
  console.log("✗ 未内置 HIC 自包含转译宿主");
  process.exit(1);
}
console.log("✓ 内置 HIC 自包含 Python/C++ 转译宿主");
// 2) 抽取内嵌宿主脚本并用假 DOM 执行（取最后一个 <script>，即页面 body 末尾的扩展编译器宿主）
const scriptBody = html.split("<script>").slice(1).map(function (s) { return s.slice(0, s.indexOf("</script>")); }).pop();
const scriptBodyTrimmed = (scriptBody || "").replace(/^\n/, "");
if (!scriptBodyTrimmed) { console.log("✗ 未抽取到宿主脚本"); process.exit(1); }
function fakeEl(lang, srcText) {
  const state = { textContent: "初始" };
  const runEl = { textContent: "", classList: { add() {} } };
  const srcEl = { textContent: srcText };
  return {
    _lang: lang,
    querySelector(sel) {
      if (sel === ".hic-ext-run") return runEl;
      if (sel === ".hic-ext-src") return srcEl;
      if (sel === ".hic-ext-state") return state;
      return null;
    },
    getAttribute(name) { return name === "data-lang" ? lang : null; },
    __runEl: runEl, __state: state
  };
}

function extract(code, tag) {
  const start = code.indexOf(tag);
  let rest = code.indexOf("\n", start) + 1;
  const end = code.indexOf(")end", rest);
  return code.slice(rest, end).replace(/\n$/, "");
}

const pyEl = fakeEl("py", extract(page.code, "py:("));
const cppEl = fakeEl("cpp", extract(page.code, "cpp:("));

global.window = { HIC_EDITION: "x" };
global.document = {
  querySelectorAll: function (sel) { return sel === ".hic-ext" ? [pyEl, cppEl] : []; }
};

try {
  const fn = new Function(scriptBody);
  fn();
} catch (e) {
  console.log("✗ 宿主脚本运行出错: " + e.message);
  console.log(scriptBody.slice(0, 500));
  process.exit(1);
}
console.log("\n---- 转译后的 Python JS ----\n" + (global.window.__pyjs || "(无)") + "\n----------------------------");
console.log("---- 逐元素 ----\n" + ((global.window.__pycl||[]).join(" \u2192 ") + "\n----------------------------"));
console.log("---- 行(缩进|内容) ----\n" + ((global.window.__pyln||[]).join("\n") + "\n----------------------------"));

const pyOut = pyEl.__runEl.textContent;
console.log("Python 输出: " + JSON.stringify(pyOut));
console.log("Python 状态: " + pyEl.__state.textContent);
const expectPy = ["py-开始", "n= 0", "n= 1", "n= 2", "Hello, HIC"].join("\n");
if (pyOut === expectPy) console.log("✓ Python 转译输出正确");
else { console.log("✗ Python 输出不符\n期望: " + JSON.stringify(expectPy)); process.exit(1); }

const cppOut = cppEl.__runEl.textContent;
console.log("C++ 输出: " + JSON.stringify(cppOut));
console.log("C++ 状态: " + cppEl.__state.textContent);
if (/cpp-结果3/.test(cppOut) && /I0I1I2/.test(cppOut.replace(/\n/g, ""))) console.log("✓ C++ 转译输出正确");
else { console.log("✗ C++ 输出不符: " + JSON.stringify(cppOut)); process.exit(1); }

console.log("\n全部通过 ✅");