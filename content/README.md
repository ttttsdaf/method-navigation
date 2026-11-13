# 方法数据与示例

`methods.json` 是六张项目场景行动卡 M01–M06 和组合 ROUTE01 的数据入口，内容修订版为 0.1.0。全部为编辑初稿：`editorial_status: draft`、`evidence_status: not_user_tested`；只说明本项目尚无真实用户实践证据。正文按 CC BY-SA 4.0 授权，文件范围见 [NOTICE](../NOTICE.md)。

| 字段 | 用途 |
| --- | --- |
| `when_to_use` / `not_for` / `requires` | 适用条件、限制与前置要求 |
| `steps` / `output` / `review_prompt` | 开始行动、留下产物、回来看什么 |
| `switch_when` / `related_method_ids` | 何时换方法、可连接到哪里 |
| `source_refs` | 原始入口、核查日期、与项目文字的关系 |
| `routes` / `hand_offs` | 方法组合及步骤间传递的材料 |

本版 `source_refs.relation` 为 `background_reading`，保留前期研究与延伸阅读入口；当前文字是新编写的项目场景说明，不是外部方法的翻译或操作手册。旧的 `adapted` / `inspired` 版本已本地归档，未随发行包分发。处理决定及原作者见 [来源说明](../docs/SOURCES.md)。

`example-record.json` 演示个人草稿和分享预览之间的信息差别。它明确标为 `synthetic_design_example`、`not_performed`、`preview_only`。人物和反馈均为虚构，不是真实案例，也不是应用自动脱敏能力的证明。

场景路线保存在 `app/scenarios.json`。当前字段便于查看和修改，尚未承诺为稳定的公共数据格式。
