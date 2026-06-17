# DailyGlance 说明

## 文件结构

- `index.html`: GitHub Pages 主页面入口
- `assets/css/dailyglance.css`: 页面样式
- `assets/js/01-config-ui.js`: UI 工具、快捷键、模态框
- `assets/js/02-data.js`: 数据源、缓存、同步、搜索、选股
- `assets/js/03-calculations.js`: 指标与信号计算
- `assets/js/04-render.js`: 图表与侧栏渲染
- `assets/js/05-app.js`: 初始化、切换、生命周期
- `备份/dailyglance-拆分前-20260618.html`: 拆分前备份

## 维护建议

- 改样式，优先看 `assets/css/dailyglance.css`
- 改接口/缓存/选股，优先看 `assets/js/02-data.js`
- 改信号逻辑，优先看 `assets/js/03-calculations.js`
- 改页面排版和文案渲染，优先看 `assets/js/04-render.js`
- 改启动流程、切换逻辑、回测入口，优先看 `assets/js/05-app.js`

## GitHub Pages 部署

1. 上传 `index.html` 和 `assets/`。
2. 在 GitHub Pages 中选择该目录对应的分支/路径。
3. 默认访问根路径时会直接打开 `index.html`。

## 注意

- 5 个脚本文件必须按当前顺序加载。
- 不建议恢复成单文件，后续改动会更费 token。
