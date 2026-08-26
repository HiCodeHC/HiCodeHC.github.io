# HIC v3.66 · 三版发布 + 编译 Python / C++ 为 HTML
#
# v3.66 起 HiCode 分三种版本：
#   M · 轻量版 —— 仅含全套 HIC 内核
#   R · 标准版 —— 全套 HIC 内核 + Python 编译（py:(...)end）
#   X · 全能版 —— 全套 HIC 内核 + Python + C++ 编译（py:(...)end / cpp:(...)end）
#
# 注意：py:(...)end / cpp:(...)end 不是「调用官方库」，而是 HIC 自己
# 把括号内的 Python / C++ 源码编译为最终 HTML —— 全程离线、不请求任何
# 外部网址或 CDN。具体哪些语言可编译，由当前使用版本的发布形态决定。

it 标题 t HIC v3.66 · 扩展语言编译
标题 in l

it 小节 t ▸ Python 编译（py 块）
小节 in t

py:(
    # HIC 会把这个 Python 代码块编译为 HTML 输出
    print('你好，HIC 编译的 Python')
    for i in range(3):
        print('n =', i)
)end

it 小节2 t ▸ C++ 编译（cpp 块）
小节2 in t

cpp:(
    // HIC 会把这个 C++ 代码块编译为 HTML 输出
    #include <iostream>
    using namespace std;
    int main() {
        cout << "你好，HIC 编译的 C++";
        for (int i = 0; i < 3; i++) cout << "I" << i;
        return 0;
    }
)end

it 提示 t 上面的 Python / C++ 块在导出页面里会各自生成一个「编译并运行」的区域，点击即可看到 HTML 输出。
提示 in s

it 版本 t 用当前版本能编译哪些语言？
版本 in t

it 提示2 t M 版不编译任何语言；R 版编译 Python；X 版编译 Python 与 C++。请按需选择版本。
提示2 in s