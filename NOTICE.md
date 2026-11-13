# 下一步 · Method Navigation — 许可与署名

版本：0.1.0（早期场景演示）。Copyright (c) 2026 ttttsdaf and contributors。

## 软件代码

`app/index.html`、`app/style.css`、`app/app.js`、`serve.py` 和 `start-preview.cmd` 按 **GNU Affero General Public License version 3 only（SPDX: AGPL-3.0-only）** 授权。完整、未经修改的条款见 [LICENSE](LICENSE)。

你可以按该许可使用、修改和分发这些代码，包括商业使用。按许可承担保留声明、标明修改、提供对应源代码等义务；修改版本通过网络与用户交互时，尤其需注意第 13 条。许可不要求向本项目提交 PR，也不赋予对项目名称、他人资料或个人信息的额外权利。

软件按许可中的无担保条款提供；没有对适用性、推荐质量或结果作保证。

## 原创内容

以下发布文件中的本项目原创表达按 **Creative Commons Attribution-ShareAlike 4.0 International（SPDX: CC-BY-SA-4.0）** 授权：

- `app/scenarios.json`、`content/methods.json`、`content/example-record.json`。
- README、VISION、ROADMAP、CONTRIBUTING、content/README、docs/SOURCES 和本 NOTICE 的项目说明文字。
- `assets/demo-desktop.jpg` 和 `assets/demo-mobile.jpg` 中的本项目界面与合成演示内容。

署名可使用“下一步 / Method Navigation，ttttsdaf 与贡献者”。再分享时保留项目来源和本声明，提供 [许可链接](https://creativecommons.org/licenses/by-sa/4.0/)，标明你的修改；对受该许可约束的改编按相同方式共享。完整法律文本见 [LICENSES/CC-BY-SA-4.0.txt](LICENSES/CC-BY-SA-4.0.txt)。

本授权仅覆盖本项目有权授权的表达，不包含外链目标、他人的方法原文/图示、商标或用户后来输入的个人记录。公共领域、思想、事实或法律例外的使用范围不由本声明另行限制。原作者来源链接不表示其认可项目，也不是授权证明。

## 六条行动卡的发布范围

0.1.0 发布的是针对三个演示场景新编写的项目行动卡和组合说明。前期根据 IDEO / Liberating Structures 整理的来源改写稿及原始取证材料没有进入此发行包；当前没有取得对那些旧稿的额外分发授权。`source_refs` 保留研究入口，关系标记为 `background_reading`。当前项目内容的 CC 授权不延伸到外部原文。

完整发行包的 `docs/SOURCES.md` 逐条记录处理决定。个人输入和未来他人的投稿不会自动归入上述授权。

## 源码与本地运行

用 Python 3.10+ 运行 `serve.py`，访问 `http://127.0.0.1:8767/`；终端按 Ctrl-C 停止。Windows 也可运行 `start-preview.cmd`。无需额外 Python 包、模型密钥或 Node。

界面页脚的“当前版本源码”会下载此实例正在读取的代码、演示数据与许可文件，只包含固定清单，不含浏览器个人记录或工作区资料。该源码包可独立运行。完整发行包另包含项目介绍与截图。部署者若修改了软件，提供的源码也应对应实际运行的版本；仅链接一个未更新的上游仓库不能说明这一点。

官方项目的价值原则是维护准则，不是对 AGPL 或 CC 已授予权利的附加限制。
