# 改动说明

本仓库基于 [LosaLosSantos/aurelio-finance](https://github.com/LosaLosSantos/aurelio-finance)
（MIT）修改，以下是与上游的全部差异。**业务逻辑、计算方式、API 结构一律未动**；
改动只涉及界面文案、本位币默认值和 AI 通道的配置方式。

## 一、界面汉化（2026-10-12）

前端界面文案约 360 处全部改为简体中文，覆盖所有页面组件与提示文案：

- 导航与页面：总览、持仓、记录（财富/实物资产/负债/现金流）、档案与目标
- 表单、按钮、占位提示、图表标题、悬停解释（"?" 面板）、错误提示、确认弹窗
- 术语统一：net worth→净资产、portfolio→持仓、liabilities→负债、cash flow→现金流、
  savings rate→储蓄率、gain/loss→盈亏、situation→快照、PAC→定投、ledger→流水

**有意保留英文的部分**：

- 代码逻辑、变量/函数/组件命名、API 字段与被代码比较的枚举值
  （如交易类型 `buy`/`sell`、问卷答案 `yes`/`no` 的存储值——界面显示中文，存储值不变）
- 专名与代码：Aurelio、justETF、Yahoo、ISIN、UCITS、交易所名、货币代码（CNY/EUR/GBp 等）
- 后端返回的动态文案：档案页的问卷题目（来自后端接口）、后端错误信息正文
  ——这些属于 API 数据，改前端不会翻译它们；要一并汉化需改后端，本版未做

## 二、本位币说明

本位币是应用内设置而非代码默认：全新安装默认 EUR（与上游一致）。中文用户在
「档案 → 本位币」切换为 CNY 即可，切换后所有合计按欧洲央行汇率换算，已记录的
金额不改写。（开发环境以 CNY 验证过全流程。）

## 三、AI 通道可配置（2026-10-12）

上游把 AI 网关写死为 OpenRouter。本版把网关地址改为环境变量 `OPENROUTER_BASE_URL`
可配，任何 OpenAI 兼容端点都能接：

- 默认仍是 OpenRouter（`https://openrouter.ai/api/v1`），上游用户不受影响
- 换 MiMo、DeepSeek、Kimi、本地模型：在 `backend/.env` 改 `OPENROUTER_BASE_URL`
  和 `OPENROUTER_MODEL` 两行即可，方法见 README 的「国内模型接入方法」
- 模型下架检查（查询 OpenRouter 公开模型列表）只在网关确为 OpenRouter 时进行；
  指向其他网关时错误提示改称该网关的域名，不再误称 OpenRouter

变量名沿用上游的 `OPENROUTER_*` 前缀以保持兼容（`.env` 无需迁移），含义已扩大为
「任一 OpenAI 兼容网关」。

## 四、其他

- `index.html` 的语言标记改为 `zh-CN`
- 断言界面文案的单元测试同步为中文期望值；测试环境固定网关为 OpenRouter，
  不受本地 `backend/.env` 影响
- 后端测试 1086 个、前端测试 162 个，改动后全部通过

## 未改动的部分

- LICENSE（MIT，版权属 LosaLosSantos）原样保留
- 后端业务逻辑、数据库结构、API 接口
- 前端交互逻辑、组件结构（只换文案字面量）
- 金额计算、汇率换算、日期处理
