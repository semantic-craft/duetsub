# 07 四站 adapter 方案逐站锁定

Type: grilling
Status: open
Blocked by: 01, 03

## Question

基于 `docs/EXTRACTION.md`、ticket 01 的 YouTube 调研、ticket 03 的真实请求样本，逐站锁定 adapter 方案，写到可实现的精度：

- 每站：match pattern、拦截点（JSON.parse 钩子 / fetch-XHR 钩子 / DOM）、字幕格式与解析器、轨道枚举与双轨配对规则、播放时钟来源、原生字幕层处理、SPA 导航/换集/seek/广告的重初始化策略。
- Netflix：`timedtexttracks` 元数据钩子 + timed text 请求；参考 NflxMultiSubs（MIT，可复用）。
- Prime Video：`www.primevideo.com` 国际站；`.ttml2` (EBU-TT)；广告时间轴风险的应对写法。
- HBO Max：新加坡区实际域名；`.vtt`；`CueBoxContainer` 选择器有效性。
- YouTube：按 ticket 01 的结论。
- 四站实现顺序（spec 里的建议路线：默认 Netflix 垂直切片先行，待确认）。

## Comments
