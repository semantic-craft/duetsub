# 06 机翻兜底细则

Type: grilling
Status: open
Blocked by: 02

## Question

基于 ticket 02 的调研事实，锁定机翻兜底策略：

1. ~~引擎拍板：选哪家、免费还是付费、key 放哪~~ **已由用户拍板（2026-07-21）：DeepSeek API + 用户自备 key**。会话内需补齐的执行细节：模型档位（deepseek-chat 即可）、zh-Hant 用 prompt 指定并核对是否需 OpenCC 保险、key 存 options 页 + `chrome.storage.local`（承 02 调研的通行做法）。
2. 翻译方向：只做 en→zh-Hant，还是只有中文轨时也做 zh→en？
3. 触发条件与优先链的完整表述：`官方 zh-Hant > 官方 zh-Hans > 机翻` 之外，英文侧的链条怎么写；官方轨只有 zh-Hans 时显示原轨还是 OpenCC 转繁（承接 map 雾区问题）。
4. 批翻与缓存：整集预翻 vs 滚动批翻；缓存 key 设计、失效策略、存储配额。
5. 失败降级：API 报错/超额时 overlay 显示什么。

## Comments
