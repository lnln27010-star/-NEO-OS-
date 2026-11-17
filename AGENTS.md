# NEO-OS 智能体开发约定

本文件对人和编码智能体同样适用。开始任务前先阅读 [团队开发规范](docs/团队与智能体开发规范.md)，并检查目标模块的现有实现与测试。用户本次任务的明确要求优先于本文件。

## 不变的技术基线

- 前端：React 19、TypeScript strict、Vite 8、Zustand、Three.js / React Three Fiber；图标统一用 `lucide-react`。
- 界面：复用项目现有 CSS 变量、深浅主题和 `src/components` 组件。共享组件放 `src/components/ui/`；复杂交互可统一封装 Radix UI 无样式基础组件。不要在单个业务页面引入 Ant Design、MUI、Element、另一套图标或另一套 CSS 框架。
- 后端：Python 3.12、FastAPI、Pydantic v2；现阶段持久化用 SQLite，数据文件放 `.solver-data/`。不自行引入另一个后端框架、ORM 或数据库。
- 求解：已有 pandapower、PyPSA、OpenFOAM、FEniCSx 适配器。真实求解与假设、演示数据严格区分；引擎不可用时报告不可用，不伪造结果。
- 依赖：前端以 `package-lock.json`、后端以 `backend/requirements.lock.txt` 为可复现安装依据。新增依赖先说明用途、体积和替代方案，并同步锁文件。

## 每次任务的工作顺序

1. 写清所属业务域、输入输出、数据来源、验收条件；复杂任务先在 Issue/PR 中拆小。
2. 检查相邻模块和接口，尽量在所属模块内修改；触及 `src/App.tsx`、`src/components/CenterWorkspace.tsx`、`src/styles.css`、`backend/api.py` 或共用数据模型时先与集成负责人对齐。
3. 前后端改动一起更新契约、单位、来源/状态标识和必要测试；不能只画界面或只加一个没有实际调用链的接口。
4. 本地完成 `npm ci`、`npx tsc -b --pretty false`、相关测试；合并前运行 `npm run build`。后端相关改动运行对应 `backend/tests/` 测试。
5. 一个任务一个分支和 PR；在 PR 写明改动、验证、数据口径与风险。不要直接改 `main`，不要提交密钥、数据库、虚拟环境或构建产物。

## 数据真实性

全国电价、政策、园区 POI、算力需求、设备铭牌、测点和投资测算必须标示来源、时间、单位与状态。省级公开数据只能作初筛，不能冒充项目接入价或已核实场址。缺数据展示“待核实”，不得用默认值填充并宣称为实测。

详细分工、组件规则、接口规则、数据库变更和 PR 清单见 [docs/团队与智能体开发规范.md](docs/团队与智能体开发规范.md)。
