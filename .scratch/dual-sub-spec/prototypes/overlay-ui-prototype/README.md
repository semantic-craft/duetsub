# DuetSub overlay UI prototype

> THROWAWAY PROTOTYPE — ticket 05 的讨论资产，不是 runtime 实现。

这个静态页面用假 cue 对比三种双字幕结构，并模拟窗口 / 全屏宽度、播放器控件遮挡、原生字幕层、机翻标识和 `position: 'top'`。

## Run

在仓库根目录执行一条命令：

```sh
python3 -m http.server 4173 --directory .scratch/dual-sub-spec/prototypes/overlay-ui-prototype
```

打开 <http://127.0.0.1:4173/?variant=A>。`variant=A|B|C` 可分享、刷新后保持；页面内其他开关也同步写入 URL。

## Variants

- `A — 描边字幕组`：两行组成紧凑字幕组，仅描边和阴影。
- `B — 紧凑背景板`：双语两行共用一块随内容收缩的半透明背景板。
- `C — 影院安全带`：两行收进横跨画面的底部 / 顶部安全带。

这些都是用来逐项拍板的试样，不是候选实现代码。
