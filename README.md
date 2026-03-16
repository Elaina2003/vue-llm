# vue-llm 智能对话前端

Vue-LLM 是一个基于 Vue 3 + Vite 构建的轻量级对话应用前端，提供富文本的聊天体验、会话管理、附件上传以及与大语言模型的串流交互能力。项目经过定制化的 UI 优化，重点关注对话可读性与文件理解能力，适合作为集成自定义大模型服务的基础界面。

## ✨ 主要特性

- **日夜双主题界面**：提供全新的柔和配色体系与日/夜模式切换按钮，侧边栏、消息气泡、输入区等组件均基于 CSS 变量自动适配亮暗主题
- **智能文件附件**：支持上传常见文本文件，同时内置 DOCX 与 PDF 解析流程，自动提取正文预览并附加到对话上下文中。
- **即时串流体验**：通过 `chatStream` 接口实时展示模型输出，滚动定位、复制代码块等体验全面优化。
- **双模型一键切换**：在聊天面板中直接选择 DeepSeek Reasoner 或 DeepSeek Chat，自由平衡推理深度与响应速度。
- **持久化存储**：借助 Pinia 与 `pinia-plugin-persistedstate`，会话记录、标题和附件说明都会保存在浏览器本地，刷新不丢失。
- **多端自适应布局**：针对桌面端、平板和移动端提供分级响应式样式，桌面界面保持原样，同时在小屏幕上提供抽屉式会话栏和整屏聊天体验。

## 🗂️ 目录结构

```
vue-llm/
├── public/                 # 静态资源
├── src/
│   ├── apis/               # 与后端或模型服务交互的 API 封装
│   ├── assets/             # 静态资源与全局样式
│   ├── components/
│   │   └── chat/           # 聊天相关的可复用组件
│   ├── stores/             # Pinia 状态管理（会话、推理记录等）
│   ├── utils/              # 工具方法
│   └── views/              # 页面级组件（聊天主界面）
├── package.json            # 项目依赖与脚本
└── vite.config.js          # Vite 配置
```

## 🚀 快速开始

### 环境要求

- Node.js 18+（推荐使用 LTS 版本）
- npm 9+ 或兼容的包管理工具（例如 pnpm、yarn）

### 安装依赖

```bash
npm install
```

安装过程会额外拉取 `jszip` 和 `pdfjs-dist`，用于解析 DOCX 与 PDF 文件。

### 启动开发服务器

```bash
npm run dev
```

默认使用 Vite 启动，可通过 `--host`、`--port` 自行调整绑定地址与端口。

### 生产构建与预览

```bash
# 构建生产包
npm run build

# 本地预览构建产物
npm run preview
```

### 代码质量检查

```bash
npm run lint
```

命令将运行 ESLint，并自动尝试修复可修复的问题。

### 配置 DeepSeek API 密钥

1. 访问 [DeepSeek 控制台](https://platform.deepseek.com/) 创建或查看 API Key，确保该密钥具有调用聊天与推理模型的权限。
2. 打开 `src/config/deepseekKey.js`，将占位字符串 `请在此填写你的 DeepSeek API 密钥...` 替换为自己的密钥，例如：
   ```js
   export const DEEPSEEK_API_KEY = "sk-xxxxxxxxxxxxxxxxxxxx";
   ```
3. 出于安全考虑，不要将真实密钥提交到版本库，可在部署环境中通过构建脚本或环境变量注入同名文件。


如在使用过程中遇到问题，欢迎反馈与讨论，让 Vue-LLM 变得更好用。
