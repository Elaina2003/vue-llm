// src/api/deepseek.js
import axios from "axios";
import { ElMessage } from "element-plus";

import { DEEPSEEK_API_KEY } from "@/config/deepseekKey";

// 🔗 创建 Axios 实例：配置基础 URL、超时时间
const api = axios.create({
  baseURL: "https://api.deepseek.com/v1",
  timeout: 240000,
});
let currentAbortController = null;

// 🔐 请求拦截器：给所有请求自动加上 Bearer Token
api.interceptors.request.use((config) => {
  const apiKey = (DEEPSEEK_API_KEY ?? "").trim();
  // 设置 HTTP 请求头，给每个请求加上 Bearer Token、Content-Type、Accept 头
  // 身份令牌Bearer Token、数据是 JSON 格式、希望你返回给我的是 流式数据
  config.headers["Authorization"] = `Bearer ${apiKey || ""}`;
  config.headers["Content-Type"] = "application/json";
  config.headers["Accept"] = "text/event-stream";
  // AbortController是一个原生的 JavaScript 工具，用于取消异步请求
  // 每次请求创建新的 AbortController
  currentAbortController = new AbortController();
  // 给每个请求加上 AbortController 信号，用于取消请求
  config.signal = currentAbortController.signal;
  // 配置完成，返回修改后的 config
  return config;
});

// ❗️响应拦截器：统一处理错误
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // 如果不是取消请求错误，处理其他错误
    if (!axios.isCancel(err)) {
      const msg = err.response?.data?.error?.message || "网络异常";
      ElMessage.error(msg);
    }
    // 如果是取消请求错误，不处理
    return Promise.reject(err);
  },
);

// 🌊 流式对话（核心函数），把 DeepSeek 服务器传回来的“碎片化”数据，整理成用户能看懂的实时文字。
/**
 * 调用 DeepSeek 接口获取流式响应。
 * @param {Array} messages 上下文消息数组
 * @param {Function} onChunk 内容增量回调
 * @param {Function} onDone 完成回调
 * @param {Function} onReasoning 推理内容回调
 */
export async function chatStream(
  // 历史对话上下文。
  messages,
  // 收到新回复字词时的回调
  onChunk,
  // 对话彻底结束时的回调
  onDone,
  // 收到 AI 思考逻辑（推理内容）时的回调
  onReasoning,
  // 模型名称，默认是 deepseek-reasoner
  model = "deepseek-reasoner",
) {
  // 状态计数器：记录已经处理过的内容片段和推理片段数量
  let processedContentChunks = 0;
  let processedReasonChunks = 0;

  // 辅助函数：把解析出来的文字（无论是单个字符还是字符数组）统一地交给回调函数去处理
  const emitTokens = (tokens, callback) => {
    // 如果外面没有传回调函数（比如用户不需要处理思考过程，没传 onReasoning ），那就直接结束
    if (!callback || tokens === undefined || tokens === null) {
      return;
    }
    // 如果 tokens 是数组，遍历每个元素，调用回调函数
    if (Array.isArray(tokens)) {
      tokens.forEach((token) => callback(token));
    } else {
      // 如果 tokens 是字符串，直接调用回调函数
      callback(tokens);
    }
  };

  // 正式调用 DeepSeek API 接口，开启流式响应模式
  await api.post(
    "/chat/completions",
    {
      model: model || "deepseek-reasoner",
      messages,
      stream: true,
    },
    {
      // 告诉 Axios 把返回内容当文本处理，而不是 JSON 格式
      responseType: "text",
      // 每当有新数据下载，就执行一次这个回调函数（流式解析逻辑）
      onDownloadProgress(evt) {
        // 拿到目前收到的全部文本
        const chunk = evt.event.currentTarget.response;
        // 按换行切开且只保留带数据的行
        const lines = chunk
          .split("\n")
          .filter((line) => line.startsWith("data: "));

        let index = 0;
        let reasonIndex = 0;

        // 遍历每一行数据
        for (const line of lines) {
          // 如果看到 [DONE]，说明 AI 说完了，执行结束回调
          if (line === "data: [DONE]") {
            onDone?.();
            return;
          }

          // 尝试从不断累积的响应文本中，精准地只抓取“新出来的字”
          try {
            // 删掉前 6 个字符（即 data: ），剩下的就是一个标准的 JSON 字符串，JSON.parse 转成对象
            const payload = JSON.parse(line.slice(6));

            // 从 JSON 中提取推理内容（如果有）
            const reasoning = payload.choices?.[0]?.delta?.reasoning_content;
            if (reasoning) {
              // 关键：只处理没处理过的推理内容
              if (reasonIndex >= processedReasonChunks) {
                // 辅助函数调用推理内容回调函数onReasoning，处理新的推理内容
                emitTokens(reasoning, onReasoning);
                // 记录已经处理到第几个“思考片段”了
                processedReasonChunks++;
              }
              // 当前循环的片段序号增加
              reasonIndex++;
            }

            // 从 JSON 中提取主回复内容（如果有）
            const delta = payload.choices?.[0]?.delta?.content;
            if (delta) {
              // 关键：只处理没处理过的主回复内容
              if (index >= processedContentChunks) {
                // 辅助函数调用主回复内容回调函数onChunk，处理新的主回复内容
                emitTokens(delta, onChunk);
                // 记录已经处理到第几个“主回复片段”了
                processedContentChunks++;
              }
              // 当前循环的片段序号增加
              index++;
            }
          } catch (error) {
            // 如果是取消请求错误，不处理
            if (axios.isCancel(error)) {
              onDone?.();
            } else {
              throw error;
            }
          }
        }
      },
    },
  );
}
// 取消当前正在进行的流式请求
export function abortStream() {
  // 如果有正在进行的请求
  if (currentAbortController) {
    // 调用 abort 方法取消请求
    currentAbortController.abort();
    // 清空当前的 AbortController 实例，准备下一次请求
    currentAbortController = null;
  }
}
