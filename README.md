# Aurelio（中文版）

> **上游署名**：本仓库是 [LosaLosSantos/aurelio-finance](https://github.com/LosaLosSantos/aurelio-finance)
> 的中文修改版，原项目以 [MIT](LICENSE) 协议发布，版权归 LosaLosSantos 所有，
> LICENSE 文件原样保留。改动内容见 [CHANGES.md](CHANGES.md)；功能设计与理念以上游
> 文档为准（[How Aurelio reasons](docs/how-aurelio-reasons.md)，英文）。

**Aurelio** 是一款跑在你自己电脑上的财富管理与财务规划应用，带一个可以对话的
AI 顾问。账目保存在你自己的机器上。AI 部分是可选的：通过任意 OpenAI 兼容网关
（默认 [OpenRouter](https://openrouter.ai)，也可用 MiMo、DeepSeek、Kimi 等），
使用你自己的 API key。

<picture>
  <img alt="Aurelio：把所有资产放在一处。净资产及其构成、基金内部的国家分布、每月结余的问答与可确认的修改提议。" src="docs/banner-light.gif" width="100%">
</picture>

## 用示例数据试跑

需要 [Git](https://git-scm.com)、[Node.js](https://nodejs.org) 22 或更高版本
和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。然后：

```bash
git clone <本仓库地址>
cd aurelio-finance
./start.sh --demo          # macOS 和 Linux
```

```powershell
git clone <本仓库地址>
cd aurelio-finance
./start.ps1 -Demo          # Windows，PowerShell 中运行
```

如果 PowerShell 提示禁止运行脚本，改用
`powershell -ExecutionPolicy Bypass -File .\start.ps1 -Demo`。

首次启动会在文件夹内自行安装依赖，并打开 <http://localhost:8000>，展示一个虚构
家庭的示例数据（单独存放在一个文件里，不碰你的真实数据）。去掉 `--demo` 参数
即使用自己的数据。

## 用自己的数据运行

```bash
./start.sh                 # macOS 和 Linux
```

```powershell
./start.ps1                # Windows
```

账目保存在 `backend/data.db`。应用在升级改变数据格式之前，会先在旁边留一份备份。

## 功能

- **财富**：你的银行和券商、现金，以及带日期的持仓快照。
- **持仓**：每个头寸按市场价计价，含成本、盈亏与分红。
- **穿透**：你的基金实际持有什么，按国家、行业、公司、货币展开。
- **定投、实物与负债**：定期投入计划、实物资产，以及为它们融资的贷款。
- **现金流与目标**：收入、支出、储蓄率，以及每个目标所需的收益率。
- **问 Aurelio**：基于你自己的账目回答的对话，可联网搜索，任何修改都以卡片
  形式提议、由你确认。
- **深度分析**：一位只看数字的分析师和一位了解你但不看数字的知己就你的持仓
  争论，最后由综述给出先看什么。

设计理念见[上游文档](docs/how-aurelio-reasons.md)。

## AI 对话与分析

应用不绑定任何一家 AI 服务商：只要兼容 OpenAI 接口即可，**默认走 OpenRouter，
换成 MiMo、DeepSeek、Kimi 或本地模型只需在 `backend/.env` 里改两行**。

1. 复制 `backend/.env.example` 为 `backend/.env`。
2. 填入 `OPENROUTER_API_KEY`（必填），按需设置 `OPENROUTER_BASE_URL` 和
   `OPENROUTER_MODEL`。

### 国内模型接入方法

| 服务商 | `OPENROUTER_BASE_URL` | `OPENROUTER_MODEL` 示例 |
|---|---|---|
| 小米 MiMo | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-pro` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Kimi（月之暗面） | `https://api.moonshot.cn/v1` | `kimi-k2.6` |
| 本地（Ollama、vLLM 等） | 按服务实际地址 | 按服务实际模型名 |

`backend/.env` 示例（以 MiMo 为例）：

```bash
OPENROUTER_BASE_URL=https://api.xiaomimimo.com/v1
OPENROUTER_API_KEY=你的 key
OPENROUTER_MODEL=mimo-v2.6-pro
```

三个变量都不需要改代码：`OPENROUTER_API_KEY` 必填，后两个留空则使用默认
（OpenRouter 网关、`anthropic/claude-opus-5.5`）。想给分析的两个角色或对话分别
指定模型，见 `.env.example` 里的 `OPENROUTER_ANALYST_MODEL` 等可选项。

**费用参考**（默认模型 Claude Opus 5.5，2026 年 10 月实测）：

| | 费用 |
|---|---|
| 首个问题，一轮回答 | $0.11 |
| 追问，一轮回答 | $0.017 |
| 一次带联网搜索的咨询 | $0.16 |
| 一次深度分析 | $0.33 ~ $0.51 |

## 开发

`backend/` 里跑 `uv run pytest`，`frontend/` 里跑 `npm test`。热重载开发：
`backend/` 里 `uv run uvicorn app.main:app --port 8000`，`frontend/` 里
`npm run dev`。

## 与上游的差异

界面已全部汉化为简体中文，AI 通道支持任一 OpenAI 兼容网关（默认 OpenRouter）；
代码逻辑未做改动。本位币在「档案」页可随时切换（推荐改成人民币）。完整清单见
[CHANGES.md](CHANGES.md)。

## License

MIT，见 [LICENSE](LICENSE)（原样保留上游协议与版权署名）。
