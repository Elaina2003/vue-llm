<!-- 这个组件是聊天输入框，用于用户输入文本和上传附件、语音输入 -->

<template>
  <div class="container">
    <div class="input-area">
      <!-- 输入框，用于用户输入文本 -->
      <textarea
        ref="textarea"
        v-model="inputText"
        class="inputbox"
        :placeholder="placeholder"
        @input="resize"
        @keydown.enter.prevent="handleEnter"
      ></textarea>

      <!-- 展示用户在输入栏里上传的附件 -->
      <transition-group name="fade" tag="div" class="attachments" v-if="attachments.length">
        <div v-for="file in attachments" :key="file.id" class="attachment-chip">
          <el-icon class="attachment-icon"><Paperclip /></el-icon>
          <div class="attachment-meta">
            <span class="attachment-name">{{ file.name }}</span>
            <span class="attachment-size">{{ formatSize(file.size) }}</span>
          </div>
          <button class="attachment-remove" type="button" @click="removeAttachment(file.id)">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </transition-group>

      <!-- 展示用户在语音输入时的预览文本 -->
      <div v-if="speechPreview" class="speech-preview">
        <el-icon><Microphone /></el-icon>
        <span>{{ speechPreview }}</span>
      </div>

      <!-- 操作栏，包含上传文件和语音输入按钮 -->
      <div class="toolbar">
        <button class="toolbar-btn" type="button" @click="triggerFilePicker">
          <el-icon><UploadFilled /></el-icon>
          <span>上传文件</span>
        </button>
        <button
          v-if="isSpeechSupported"
          class="toolbar-btn"
          :class="{ recording: isRecording }"
          type="button"
          @click="toggleRecording"
          :disabled="isTyping"
        >
          <el-icon><Microphone /></el-icon>
          <span>{{ isRecording ? "停止语音" : "语音输入" }}</span>
        </button>
        <span class="toolbar-hint">Shift + Enter 换行</span>
      </div>
    </div>

    <!-- 发送按钮区域 -->
    <div class="action-area">
      <button
        v-if="!isTyping"
        class="send-button"
        type="button"
        :disabled="sendDisabled"
        @click="handleSubmit"
      >
        <span>发送</span>
        <el-icon><Promotion /></el-icon>
      </button>
      <button v-else class="stop-button" type="button" @click="stopGeneration">
        停止
        <el-icon class="stop-icon"><CircleClose /></el-icon>
      </button>
    </div>

    <!-- 隐藏的文件上传输入框，用于触发文件选择对话框 -->
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      multiple
      :accept="acceptAttribute"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup>
import {
  CircleClose,
  Close,
  Microphone,
  Paperclip,
  Promotion,
  UploadFilled,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import JSZip from "jszip";
import {
  computed,
  defineEmits,
  defineProps,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

import { abortStream } from "@/apis/deepseek";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

defineOptions({ name: "ChatInput" });

// 配置 PDF.js 全局工作线程，用于处理 PDF 文件解析。
if (pdfjsLib?.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

// 定义组件的属性，包括消息内容、是否正在输入等。
const props = defineProps({
  msg: {
    type: String,
    default: "",
  },
  isTyping: {
    type: Boolean,
    default: false,
  },
});

// 定义组件的事件，包括更新消息内容、是否正在输入、提交等。
const emit = defineEmits(["update:msg", "update:isTyping", "submit"]);

/**
 * 文本输入框的双向绑定代理，直接透传给父组件维护的状态，
 * 方便 ChatMessage 统一管理消息体。
 */
const inputText = computed({
  get: () => props.msg,
  set: (val) => emit("update:msg", val),
});

/**
 * 父组件会告知当前是否在生成回答，根据该状态控制按钮和语音录制。
 */
const isTyping = computed({
  get: () => props.isTyping,
  set: (val) => emit("update:isTyping", val),
});

const textarea = ref(null);
const fileInput = ref(null);
const attachments = ref([]);
const speechPreview = ref("");
const isRecording = ref(false);
const recognition = ref(null);

/**
 * 允许上传的文件扩展名白名单，涵盖常见文本、文档以及代码类型。
 */
const ALLOWED_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "log",
  "pdf",
  "doc",
  "docx",
  "xml",
  "yml",
  "yaml",
  "html",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "vue",
  "py",
  "java",
  "c",
  "cpp",
  "cc",
  "h",
  "hpp",
  "cs",
  "php",
  "rb",
  "go",
  "rs",
  "kt",
  "swift",
  "sql",
  "sh",
]);

/**
 * 部分浏览器在读取文件时只提供 MIME Type，因此补充一份允许的类型列表。
 */
const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/xml",
  "text/xml",
  "text/html",
  "text/css",
  "text/x-python",
  "text/x-java-source",
  "text/x-c",
  "text/x-c++",
  "text/x-script.python",
  "application/javascript",
  "text/javascript",
]);

/**
 * 文件选择框需要的 accept 属性，帮助用户只挑选受支持的格式。
 */
const acceptAttribute = computed(() =>
  Array.from(ALLOWED_EXTENSIONS)
    // 把数组里的每一项（比如 pdf ）前面都加上一个点，变成 .pdf
    .map((ext) => `.${ext}`)
    .join(","),
    // 如果 ALLOWED_EXTENSIONS 是 ['pdf', 'txt', 'md'] ，那么这行代码计算出来的结果就是： ".pdf,.txt,.md"
);

// 输入框的占位符，根据是否支持语音输入动态切换。
const placeholder = computed(() =>
  isSpeechSupported.value
    ? "输入你的问题，或点击语音输入按钮试试看…"
    : "输入你的问题…",
);

// 提交按钮是否禁用，根据输入内容和附件状态判断。
const sendDisabled = computed(
  () => !inputText.value.trim() && attachments.value.length === 0,
);

// 是否支持语音输入，根据浏览器 API 动态判断。
const isSpeechSupported = computed(
  () =>
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window),
);

// 动态调整输入框高度，根据内容自动调整高度，最小 120px，最大 240px。
const resize = () => {
  const el = textarea.value;
  if (!el) return;

  const minHeight = 120;
  const maxHeight = 240;
  el.style.height = "auto";
  // 计算下一个高度，确保在最小高度和最大高度之间
  const nextHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
  el.style.height = `${nextHeight}px`;
  // 如果内容超出最大高度，显示滚动条；否则隐藏滚动条
  el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
};

// 文件大小显示助手，自动选择合适的单位。
const formatSize = (size) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TEXT_PREVIEW = 8000;

// 生成唯一附件 ID，用于管理和识别附件。
const createAttachmentId = () => {
  // crypto.randomUUID() : 这是现代浏览器原生支持的 API，专门用来生成一个极其复杂、几乎不可能重复的字符串
  // 如果浏览器支持 crypto.randomUUID，直接使用它生成 UUID
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 否则，使用时间戳和随机数组合生成一个唯一 ID
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

// 为附件正文提供安全的截断逻辑，避免超长文本撑开气泡。
const truncatePreview = (text = "") => {
  const trimmed = text.trim();
  const body = trimmed.slice(0, MAX_TEXT_PREVIEW);
  const note =
    trimmed.length > MAX_TEXT_PREVIEW
      ? "内容已截断，仅展示前 8000 字符"
      : "";
  return { body, note };
};

// 处理 纯文本类文件 （如 .txt , .md , .js 等）的核心工具
const readAsPlainText = (file) =>
  // Promise会等到文件读完、截断完，才继续往下走
  new Promise((resolve) => {
    // JavaScript 原生的 FileReader API, 用于读取文件内容。
    const reader = new FileReader();
    // “读取完成”后的回调函数
    reader.onload = () => {
      // 读取完成后，结果保存在 reader.result 中,转换为字符串
      const result = (reader.result ?? "").toString();
      // 截断处理，确保不会超出最大预览长度,然后通过 resolve 把最终结果发射出去
      resolve(truncatePreview(result));
    };
    // 正式启动读取操作，以 UTF-8 编码
    reader.readAsText(file, "utf-8");
  });

// 在浏览器里“解剖” Word 文档并提取文字
const extractDocxText = async (file) => {
  try {
    // 先把文件转换为 ArrayBuffer（二进制格式），因为 JSZip 要求的输入格式是 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    // 使用 JSZip 库加载 ArrayBuffer，将 DOCX 文件“解压缩”
    const zip = await JSZip.loadAsync(arrayBuffer);
    // 从解压缩后的 ZIP 文件中提取 word/document.xml 这个文件
    const documentFile = zip.file("word/document.xml");
    // 如果 ZIP 文件中没有 word/document.xml 这个文件，说明 DOCX 文件结构有问题
    if (!documentFile) {
      return {
        body: "",
        note: "未能解析 DOCX 正文内容，已附带文件信息。",
      };
    }
    // 从 word/document.xml 文件中提取文本内容
    const xml = await documentFile.async("string");
    // 使用 DOMParser 解析 XML 字符串为 DOM 文档对象
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    // 从 DOM 文档中提取所有段落（<w:p> 标签）
    const paragraphs = Array.from(doc.getElementsByTagName("w:p"));
    // 从每个段落中提取文本内容（<w:t> 标签），并合并为一个字符串
    const text = paragraphs
      .map((p) =>
        Array.from(p.getElementsByTagName("w:t"))
          .map((node) => node.textContent)
          .join(""),
      )
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
    // 如果提取到的文本为空，说明 DOCX 文件未包含可提取的文本内容
    if (!text.trim()) {
      return {
        body: "",
        note: "DOCX 文件未检测到可提取的文本内容。",
      };
    }
    // 如果提取到的文本不为空，返回截断后的结果
    return truncatePreview(text);
  } catch (error) {
    console.error("Failed to extract DOCX", error);
    return {
      body: "",
      note: "解析 DOCX 文件时出错，已附带文件元信息。",
    };
  }
};

// 在浏览器里“解剖” PDF 文档并提取文字
const extractPdfText = async (file) => {
  try {
    // 先把文件转换为 ArrayBuffer（二进制格式），因为 pdfjsLib 要求的输入格式是 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    // 使用 pdfjsLib 库加载 ArrayBuffer，将 PDF 文件“解压缩”
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const chunks = [];
    // 遍历 PDF 文件的每一页
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      // 提取当前页的文本内容
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      // 从文本内容中提取文本字符串，并合并为一个字符串
      // 每个 item 可能包含 str 属性（文本内容）或 dir 属性（文本方向）
      // 我们只关注 str 属性，其他属性可以忽略
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      // 如果当前页提取到的文本不为空，加入到结果数组中
      if (pageText) {
        chunks.push(pageText);
      }
      // 如果累计提取的文本长度超过最大预览长度的 1.5 倍，提前结束遍历
      if (chunks.join("\n\n").length > MAX_TEXT_PREVIEW * 1.5) {
        break;
      }
    }
    // 合并所有页的文本内容，用双换行符分隔
    const combined = chunks.join("\n\n");
    // 如果合并后的文本为空，说明 PDF 文件未包含可提取的文本内容
    if (!combined.trim()) {
      return {
        body: "",
        note: "PDF 文件未检测到可提取的文本内容。",
      };
    }
    // 如果合并后的文本不为空，返回截断后的结果
    return truncatePreview(combined);
  } catch (error) {
    console.error("Failed to extract PDF", error);
    return {
      body: "",
      note: "解析 PDF 文件时出错，已附带文件元信息。",
    };
  }
};

// 读取文件内容，根据文件类型调用不同的处理函数
const readFileContent = async (file) => {
  const name = file.name || "";
  const type = file.type || "";

  /**
   * 读取纯文本或结构化文本类型，避免误判导致的编码问题。
   */

  //  如果文件类型是纯文本或结构化文本类型，调用 readAsPlainText 函数读取内容
  if (
    type.startsWith("text/") ||
    type.includes("json") ||
    /\.(md|txt|csv|json|log)$/i.test(name)
  ) {
    return readAsPlainText(file);
  }

  // 如果文件类型是 DOCX 格式，调用 extractDocxText 函数提取文本内容
  if (/\.docx$/i.test(name) || type.includes("officedocument.wordprocessingml")) {
    return extractDocxText(file);
  }

  // 如果文件类型是 PDF 格式，调用 extractPdfText 函数提取文本内容
  if (/\.pdf$/i.test(name) || type === "application/pdf") {
    return extractPdfText(file);
  }

  return {
    body: "",
    note: "该文件为非文本格式，已附带元信息供参考。",
  };
};

/**
 * 根据扩展名或 MIME Type 判断文件是否受支持。
 */
const isFileTypeAllowed = (file) => {
  const name = file.name || "";
  // 用点号把文件名切成数组，取回数组的 最后一项（即扩展名），并转换为小写
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const type = (file.type || "").toLowerCase();

  // 如果扩展名在允许列表中，返回 true
  if (extension && ALLOWED_EXTENSIONS.has(extension)) {
    return true;
  }

  // 如果 MIME Type 在允许列表中，返回 true
  if (type && ALLOWED_MIME_TYPES.has(type)) {
    return true;
  }

  // 如果以上条件都不满足，返回 false
  return false;
};

/**
 * 当文件类型不在允许范围内时，弹出置中的警告弹窗进行说明。
 */
const showUnsupportedFileAlert = (file) =>
  ElMessageBox.alert(
    `${file.name || "该文件"} 的格式暂不支持，请上传文本、文档或常见代码文件。`,
    "文件类型不支持",
    {
      confirmButtonText: "我知道了",
      center: true,
    },
  );

// 处理文件选择事件，过滤不支持的文件类型和超过大小限制的文件
const handleFileChange = async (event) => {
  // 从事件对象中获取选中的文件数组
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  // 遍历选中的文件数组
  for (const file of files) {
    // 如果文件类型不在允许范围内，弹出警告弹窗并跳过当前文件
    if (!isFileTypeAllowed(file)) {
      await showUnsupportedFileAlert(file);
      continue;
    }

    // 如果文件大小超过最大限制，弹出警告弹窗并跳过当前文件
    if (file.size > MAX_FILE_SIZE) {
      ElMessage.warning(`${file.name} 超过 ${formatSize(MAX_FILE_SIZE)}，已忽略`);
      continue;
    }

    // 如果文件类型在允许范围内，读取文件内容并添加到附件列表中
    const { body, note } = await readFileContent(file);
    attachments.value.push({
      id: createAttachmentId(),
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      body,
      note,
      addedAt: Date.now(),
    });
  }

  // 清空文件输入框的值，确保下一次选择文件时不会包含已处理的文件
  event.target.value = "";
  await nextTick();
  // 调用 resize 函数调整文本区域高度，确保输入框紧凑
  resize();
};

// 删除指定 ID 的附件
const removeAttachment = (id) => {
  attachments.value = attachments.value.filter((item) => item.id !== id);
};

// 触发文件选择器，模拟点击文件输入框
const triggerFilePicker = () => {
  fileInput.value?.click();
};

// 处理提交事件，当用户点击发送或按回车键时，就会触发
const handleSubmit = () => {
  if (sendDisabled.value) return;
  // 提交包含附件列表的对象
  emit("submit", {
    attachments: attachments.value.map((item) => ({ ...item })),
  });
  // 提交完成后，清空附件列表和语音预览
  attachments.value = [];
  speechPreview.value = "";
  // 提交完成后，调用 resize 函数调整文本区域高度
  nextTick(() => {
    resize();
  });
};

// 处理回车键事件，当用户按 Shift + 回车键时，插入换行符
const handleEnter = (event) => {
  // 检查用户是否同时按住了 Shift 键
  if (event.shiftKey) {
    const el = textarea.value;
    if (!el) return;
    // 光标开始的位置和结束的位置
    const { selectionStart, selectionEnd } = el;
    const value = inputText.value;
    // 这一步把原有的文字拆成两半，中间强行塞进一个 \n （换行符），然后重新赋值给输入框
    const newValue = `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`;
    inputText.value = newValue;
    // 调整光标位置，将其移动到换行符的后面
    nextTick(() => {
      el.selectionStart = el.selectionEnd = selectionStart + 1;
      resize();
    });
    return;
  }

  // 如果用户没有按住 Shift 键，正常提交表单
  handleSubmit();
};

// 处理停止生成事件，当用户点击停止按钮时，调用此函数
const stopGeneration = () => {
  abortStream();
};

// 确保语音识别实例存在，若不存在则创建一个新实例
const ensureRecognition = () => {
  // 如果浏览器不支持语音识别 API 或已经存在识别实例，直接返回
  if (!isSpeechSupported.value || recognition.value) return;

  // 检查浏览器是否支持语音识别 API
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  // 创建一个新的语音识别实例
  const instance = new SpeechRecognition();
  // 设置识别语言为中文
  instance.lang = "zh-CN";
  // 允许 interimResults（ interimResults 是指在识别过程中，实时返回的中间结果）
  instance.interimResults = true;
  // 设置为连续识别模式（continuous 是指是否在识别过程中持续监听用户的语音输入）
  instance.continuous = true;
  // 处理识别结果事件，当语音识别返回结果时触发
  instance.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    // 遍历识别结果事件中的每个结果
    for (const result of event.results) {
      // 如果结果是最终结果（isFinal 为 true），则添加到最终文本中
      if (result.isFinal) {
        finalText += result[0].transcript;
      } else {
        // 如果结果不是最终结果（isFinal 为 false），则添加到中间文本中
        interimText += result[0].transcript;
      }
    }

    // 如果最终文本不为空，将其添加到输入框中并触发高度调整
    if (finalText) {
      inputText.value = `${inputText.value} ${finalText}`.trim();
      nextTick(resize);
    }
    // 把中间文本赋值给语音预览
    speechPreview.value = interimText;
  };

  // 处理识别错误事件，当语音识别遇到错误时触发
  instance.onerror = () => {
    stopRecording();
  };

  // 处理识别结束事件，当语音识别完成时触发
  instance.onend = () => {
    stopRecording();
  };

  // 把识别实例赋值给全局变量 recognition.value
  recognition.value = instance;
};

// 开始录音
const startRecording = () => {
  if (!isSpeechSupported.value || isRecording.value) return;
  // 确保识别实例存在
  ensureRecognition();
  try {
    // 调用识别实例的 start 方法开始录音
    recognition.value?.start();
    // 设置 isRecording.value 为 true 表示正在录音
    isRecording.value = true;
    // 显示语音预览文本 "正在听…"
    speechPreview.value = "正在听…";
  } catch (error) {
    // 捕获并处理错误，显示错误消息
    console.error(error);
    ElMessage.error("无法启动语音识别");
    // 设置 isRecording.value 为 false 表示录音已停止
    isRecording.value = false;
  }
};

// 停止录音
const stopRecording = () => {
  if (recognition.value && typeof recognition.value.stop === "function") {
    // 调用识别实例的 stop 方法停止录音
    recognition.value.stop();
  }
  // 设置 isRecording.value 为 false 表示录音已停止
  isRecording.value = false;
  // 清空语音预览文本
  speechPreview.value = "";
};

// 切换录音状态，若正在录音则停止，否则开始录音
const toggleRecording = () => {
  if (isRecording.value) {
    stopRecording();
  } else {
    startRecording();
  }
};

onMounted(() => {
  resize();
});

// 组件卸载时确保停止录音，避免内存泄漏
onBeforeUnmount(() => {
  stopRecording();
});

// 当内容被清空时重新计算高度，保持输入框紧凑
watch(inputText, (value) => {
  if (!value.trim()) {
    nextTick(resize);
  }
});

// 一旦开始生成回答立即停止语音识别，避免录音状态悬挂
watch(isTyping, (value) => {
  if (value) {
    stopRecording();
  }
});
</script>

<style scoped>
.container {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--color-panel);
  border-top: 1px solid var(--color-border);
  backdrop-filter: blur(6px);
}

.input-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inputbox {
  width: 100%;
  min-height: 120px;
  max-height: 240px;
  font-size: 15px;
  line-height: 1.6;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-input-background);
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
  resize: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  outline: none;
}

.inputbox:focus {
  border-color: var(--color-accent);
  box-shadow: 0 4px 18px rgba(59, 130, 246, 0.18);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 12px;
  border: none;
  background: var(--color-toolbar-bg);
  color: var(--color-toolbar-text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toolbar-btn:hover {
  background: var(--color-toolbar-hover-bg);
  color: var(--color-accent-strong);
}

.toolbar-btn.recording {
  background: var(--color-stop-button-bg);
  color: var(--color-stop-button-text);
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-toolbar-muted);
}

.attachments {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 12px;
  background: var(--color-toolbar-bg);
  color: var(--color-text-secondary);
  border: 1px solid rgba(59, 130, 246, 0.18);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}

.attachment-icon {
  font-size: 14px;
}

.attachment-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.attachment-name {
  font-size: 13px;
  font-weight: 500;
}

.attachment-size {
  font-size: 11px;
  color: var(--color-muted);
}

.attachment-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-muted);
  transition: color 0.2s ease;
}

.attachment-remove:hover {
  color: var(--color-danger);
}

.speech-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--color-toolbar-bg);
  border: 1px solid rgba(59, 130, 246, 0.18);
}

.action-area {
  display: flex;
  align-items: center;
}

.send-button,
.stop-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  height: 48px;
  border-radius: 16px;
  border: none;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.send-button {
  background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
  color: var(--color-accent-contrast);
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.28);
}

.send-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  box-shadow: none;
}

.send-button:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 20px rgba(59, 130, 246, 0.36);
}

.stop-button {
  background: var(--color-stop-button-bg);
  color: var(--color-stop-button-text);
  box-shadow: 0 6px 12px var(--color-stop-button-shadow);
}

.stop-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px var(--color-stop-button-shadow);
}

.stop-icon {
  font-size: 16px;
}

.file-input {
  display: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 960px) {
  .container {
    flex-direction: column;
    align-items: stretch;
  }

  .action-area {
    justify-content: flex-end;
  }
}

@media (max-width: 768px) {
  .container {
    padding: 16px 18px;
    gap: 12px;
  }

  .toolbar {
    gap: 10px;
  }

  .toolbar-hint {
    margin-left: 0;
    width: 100%;
    text-align: right;
  }

  .action-area {
    width: 100%;
  }

  .send-button,
  .stop-button {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .container {
    padding: 14px 14px;
  }

  .toolbar-btn span {
    display: none;
  }

  .toolbar-hint {
    font-size: 11px;
  }
}
</style>
