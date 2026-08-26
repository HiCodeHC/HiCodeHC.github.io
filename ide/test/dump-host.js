const fs = require("fs");
const HC = require("/workspace/repo/ide/js/hic.js");
const page = {
  name: "demo",
  code: "it t1 t 演示\npy:(\n  print('hi')\n)end\ncpp:(\n  cout << \"x\";\n)end\nt1 in t",
  images: {}, files: {}
};
const html = HC.buildSinglePageHtml({ name: "我的项目" }, page);
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i);
fs.writeFileSync("/workspace/repo/ide/test/tmp-host.js", m[1]);
console.log("written, length=" + m[1].length);