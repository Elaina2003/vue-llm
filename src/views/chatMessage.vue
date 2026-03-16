<!-- 这个组件用于渲染聊天消息列表，包含用户和助手的消息，
 把侧边栏、输入框和消息显示全部组织在一起，并处理最复杂的 AI 流式响应逻辑 -->

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  watch,
  watchEffect,
} from "vue";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { markdownItTable } from "markdown-it-table";
import {
  CopyDocument,
  EditPen,
  Close,
  Delete,
  RefreshRight,
  DocumentCopy,
} from "@element-plus/icons-vue";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";

import { chatStream } from "@/apis/deepseek";
import AttachmentPreview from "@/components/chat/AttachmentPreview.vue";
import ChatInput from "@/components/chat/ChatInput.vue";
import { useSessionStore } from "@/stores/session";
import assistantAvatar from "@/assets/avatars/assistant.svg";
import userAvatar from "@/assets/avatars/user.svg";

defineOptions({ name: "ChatMessage" });

const sessionStore = useSessionStore();
const msg = ref("");
const isTyping = ref(false);
const showNewMessageIndicator = ref(false);

// 要读取 selectedModel 的值时，它会执行get，去pinia获取当前模型
// 给 selectedModel 赋值时，会执行set，将新值存储到 pinia 中
const selectedModel = computed({
  get: () => sessionStore.model,
  set: (value) => sessionStore.setModel(value),
});

const modelOptions = computed(() => sessionStore.modelOptions);

const shouldUseReasoner = computed(
  () => selectedModel.value === "deepseek-reasoner",
);

/**
 * 读取当前会话的消息记录，并保持响应式更新。
 */
const messages = computed(() => sessionStore.getcurmsgs());
/**
 * 深度推理模型的思考链内容，按会话隔离。
 */
const reasoningList = computed(
  () => sessionStore.reason[sessionStore.curname] ?? [],
);
/**
 * 控制每条思考链是否展开显示。
 */
const reasonVisibility = computed(
  () => sessionStore.showreason[sessionStore.curname] ?? [],
);

// 监听会话名称变化，切换会话时自动回到底部并隐藏“新消息”提示
watch(
  () => sessionStore.curname,
  async () => {
    // 切换会话后自动回到底部并隐藏“新消息”提示
    autoScroll = true;
    showNewMessageIndicator.value = false;
    await forceScrollToBottom();
  },
);

/**
 * 配置 Markdown 渲染器，支持代码高亮、表格等格式。
 */
const md = new MarkdownIt({
  // 代码高亮函数
  highlight: (code, lang) => {
    // 检查语言是否存在且hljs支持该语言
    const validLang = !!(lang && hljs.getLanguage(lang));
    // 如果语言有效，使用指定语言高亮；否则让程序检测是什么语言
    const highlighted = validLang
      ? hljs.highlight(code, { language: lang }).value
      : hljs.highlightAuto(code).value;
    // 返回高亮后的HTML代码，包含语言类名（如果有效）
    return `<pre><code class="hljs ${validLang ? `language-${lang}` : ""}">${highlighted}</code></pre>`;
  },
  html: true,
  linkify: true,
  breaks: true,
  typographer: true,
  tables: true,
});

// 启用表格渲染插件
md.use(markdownItTable);

const CHAT_CONTAINER_SELECTOR = ".content";
const CHAT_EVENTS = ["wheel", "touchstart", "mousedown", "keydown"];

// 获取聊天容器元素，用于滚动操作
const getChatContainer = () => document.querySelector(CHAT_CONTAINER_SELECTOR);

/**
 * 强制滚动到底部，用于会话切换或初始化场景。
 */
const forceScrollToBottom = async () => {
  await nextTick();
  // 等待 DOM 更新完成，确保元素存在
  await new Promise((resolve) => setTimeout(resolve, 200));
  const container = getChatContainer();
  if (container) {
    // 先设置滚动位置到最大，再平滑滚动到底部
    container.scrollTop = container.scrollHeight;
    setTimeout(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }, 100);
  }
};

let autoScroll = true;

const scrollToBottom = async () => {
  if (!autoScroll) return;
  await nextTick();
  // 等待 DOM 更新完成，确保元素存在
  await new Promise((resolve) => setTimeout(resolve, 100));
  const container = getChatContainer();
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
};

// 点击新消息指示器时，滚动到底部并隐藏指示器
const scrollToBottomOnClick = async () => {
  autoScroll = true;
  showNewMessageIndicator.value = false;
  await scrollToBottom();
};

/**
 * 用户滚动、键盘等操作会取消自动滚动，避免打断阅读。
 */
const handleUserInteraction = () => {
  autoScroll = false;
  if (isTyping.value) {
    showNewMessageIndicator.value = true;
  }
};

// 监听滚动事件，判断是否需要自动滚动
const handleScroll = () => {
  const container = getChatContainer();
  if (!container) return;
  // 解构赋值，获取滚动相关属性，分别为：滚动位置、滚动高度、可见高度
  const { scrollTop, scrollHeight, clientHeight } = container;
  // 滚动位置 + 可见高度 小于 滚动高度 - 10 时，说明用户未滚动到底部
  if (scrollTop + clientHeight < scrollHeight - 10) {
    // 先设置自动滚动关闭，再判断是否需要显示新消息指示器
    autoScroll = false;
    // 如果用户正在输入，显示新消息指示器，不开启自动滚动
    if (isTyping.value) {
      showNewMessageIndicator.value = true;
    }
    // 如果用户未滚动到底部，且未输入，开启自动滚动，不开启新消息指示器
  } else {
    autoScroll = true;
    showNewMessageIndicator.value = false;
  }
};

// 注册聊天容器事件监听器，包括滚动、用户交互等
const registerChatListeners = () => {
  const container = getChatContainer();
  if (!container) return;
  // 监听CHAT_EVENTS的各种事件，当事件触发时，调用handleUserInteraction函数
  CHAT_EVENTS.forEach((event) =>
    container.addEventListener(event, handleUserInteraction, { passive: true }),
  );
  // 监听滚动事件，当滚动时，调用handleScroll函数
  container.addEventListener("scroll", handleScroll, { passive: true });
};

/**
 * 移除聊天容器事件监听器，避免内存泄漏。
 */
const removeChatListeners = () => {
  const container = getChatContainer();
  if (!container) return;
  // 移除CHAT_EVENTS的各种事件监听器，当事件触发时，调用handleUserInteraction函数
  CHAT_EVENTS.forEach((event) =>
    container.removeEventListener(event, handleUserInteraction),
  );
  // 移除滚动事件监听器，当滚动时，调用handleScroll函数
  container.removeEventListener("scroll", handleScroll);
};

// 累加器，暂存模型返回的增量内容
const pendingDeltas = ref("");
// 定时器，用于延迟调用flushBuffer函数，避免频繁调用
let bufferTimer = null;

/**
 * 累积模型返回的增量内容，避免频繁更新造成性能问题。
 */
// 将累加器中的内容添加到会话存储中
const flushBuffer = () => {
  if (!pendingDeltas.value) return;
  // 当有增量内容时，将其添加到会话存储
  sessionStore.adddelta(pendingDeltas.value);
  // 清空累加的增量内容
  pendingDeltas.value = "";
  scrollToBottom();
};

// 每200ms将增量内容添加给累加器，用于批量添加到会话存储中
const onDelta = (delta) => {
  // 当有增量内容时，将其添加到累加器中
  pendingDeltas.value += delta;
  // 当定时器为空时，开启定时器，200ms后调用flushBuffer函数，将累加器中的内容添加到会话存储，
  // 并清空定时器，用于下一次增量内容的累加
  if (!bufferTimer) {
    bufferTimer = setTimeout(() => {
      flushBuffer();
      bufferTimer = null;
    }, 200);
  }
};

// 处理推理链中的增量内容，将其添加到会话存储中
const handleReasoningDelta = (delta) => {
  if (!shouldUseReasoner.value) {
    return;
  }
  // 当使用推理链时，将增量内容添加到pinia
  sessionStore.add(delta);
  scrollToBottom();
};

// 处理流式请求结束，将累加器中的内容添加到会话存储中
const handleStreamFinished = () => {
  isTyping.value = false;
  flushBuffer();
  showNewMessageIndicator.value = false;
};

// 当用户停止输入时，立即将累加器中的内容添加到会话存储中
watchEffect(() => {
  if (!isTyping.value) {
    flushBuffer();
  }
});

// 组件挂载时，添加复制按钮、滚动到底部、注册聊天容器事件监听器
onMounted(async () => {
  addCopyButtons();
  await forceScrollToBottom();
  registerChatListeners();
});

// 组件更新时，添加复制按钮
onUpdated(() => {
  addCopyButtons();
});

// 组件卸载时，清除定时器、累加器中的内容、移除聊天容器事件监听器
onBeforeUnmount(() => {
  clearTimeout(bufferTimer);
  flushBuffer();
  removeChatListeners();
});

/**
 * 发送消息时处理文本、附件并发起流式请求。
 */
const submit = async ({ attachments = [] } = {}) => {
  const trimmed = msg.value.trim();
  if (!trimmed && !attachments.length) return;

  const placeholder = "";
  // 当用户发送消息时，将消息添加到会话存储中
  sessionStore.sessionpush({
    role: "user",
    content: trimmed,
    attachments,
  });
  // 当使用推理模型时，添加占位符到推理链中
  if (shouldUseReasoner.value) {
    sessionStore.reasonadd(placeholder);
    sessionStore.reasonadd(placeholder);
  }
  msg.value = "";
  await scrollToBottom();

  // 当用户发送消息时，将空的ai消息添加到会话存储中
  const aiMessage = { role: "assistant", content: "", attachments: [] };
  sessionStore.sessionpush(aiMessage);
  isTyping.value = true;
  autoScroll = true;

  try {
    // 获取发送给 AI 的历史上下文消息
    const payloadMessages = sessionStore.getMessagesForModel();
    // pop() 是为了防止在发送给 AI 的历史上下文中出现重复的消息
    if (payloadMessages.length) {
      payloadMessages.pop();
    }
    // 发起流式请求
    await chatStream(
      // 发送给 AI 的历史上下文消息
      payloadMessages,
      // 当有增量内容时，将其添加到累加器中
      onDelta,
      // 当流式请求结束时，将累加器中的内容添加到会话存储中
      handleStreamFinished,
      // 当有推理链增量内容时，将其添加到推理链中
      handleReasoningDelta,
      selectedModel.value,
    );
  } catch (error) {
    isTyping.value = false;
    aiMessage.content = "抱歉，回复生成出错";
    showNewMessageIndicator.value = false;
    flushBuffer();
    console.error(error);
  } finally {
    autoScroll = true;
  }
};

// 渲染Markdown文本
const renderMarkdown = (raw) => md.render(raw || "");

/**
 * 给代码块添加复制按钮，便于用户快速复制答案示例。
 */
const addCopyButtons = () => {
  nextTick(() => {
    // 所有代码块
    const codeBlocks = document.querySelectorAll(
      `${CHAT_CONTAINER_SELECTOR} pre`,
    );
    codeBlocks.forEach((block) => {
      if (block.querySelector(".copy-btn")) return;
      // 创建复制按钮
      const button = document.createElement("button");
      button.className = "copy-btn";
      button.innerHTML = "复制";
      button.addEventListener("click", () => {
        // 选中代码块中的文本，用于复制
        const code = block.querySelector("code")?.textContent ?? "";
        // 复制代码到剪贴板，成功后显示已复制提示
        navigator.clipboard.writeText(code).then(() => {
          button.textContent = "已复制！";
          // 2秒后恢复按钮文本
          setTimeout(() => {
            button.textContent = "复制";
          }, 2000);
        });
      });
      // 将复制按钮添加到代码块中
      block.appendChild(button);
    });
  });
};

// 复制普通文本消息
const copyMessage = (text) => {
  navigator.clipboard.writeText((text ?? "").trim());
};

// 复制Markdown格式的文本消息
const copyMessageMarkdown = (text) => {
  navigator.clipboard.writeText(text ?? "");
};

// 删除会话存储中的消息
const handleDeleteMessage = (index) => {
  sessionStore.removeMessageAt(index);
};

// 重新生成指定索引位置的消息
const handleRegenerateMessage = async (index) => {
  const target = messages.value[index];
  // 检查目标消息是否存在、是否为ai角色、是否正在输入中
  if (!target || target.role !== "assistant" || isTyping.value) {
    return;
  }

  // 从会话存储中删除目标消息及其后的所有消息
  sessionStore.trimMessagesFrom(index);
  const placeholder = "";
  // 当使用推理模型时，添加占位符到推理链中
  if (shouldUseReasoner.value) {
    sessionStore.reasonadd(placeholder);
  }

  // 当用户重新生成消息时，将空的ai消息添加到会话存储中
  const aiMessage = { role: "assistant", content: "", attachments: [] };
  sessionStore.sessionpush(aiMessage);
  isTyping.value = true;
  autoScroll = true;

  try {
    // 获取发送给 AI 的历史上下文消息
    const payloadMessages = sessionStore.getMessagesForModel();
    // pop() 是为了防止在发送给 AI 的历史上下文中出现重复的消息
    if (payloadMessages.length) {
      payloadMessages.pop();
    }
    // 发起流式请求
    await chatStream(
      payloadMessages,
      onDelta,
      handleStreamFinished,
      handleReasoningDelta,
      selectedModel.value,
    );
  } catch (error) {
    isTyping.value = false;
    aiMessage.content = "抱歉，重新生成时出错";
    showNewMessageIndicator.value = false;
    flushBuffer();
    console.error(error);
  } finally {
    autoScroll = true;
  }
};

// 根据角色返回对应的头像
const avatarForRole = (role) => (role === "user" ? userAvatar : assistantAvatar);

// 会话标题编辑状态，用于判断是否正在编辑标题
const isEditingTitle = ref(false);
// 临时标题
const tempTitle = ref("");

/**
 * 进入标题编辑态，聚焦输入框方便直接修改。
 */
const startEditing = () => {
  // 复制当前会话标题到临时标题，用于编辑
  tempTitle.value = sessionStore.curname;
  isEditingTitle.value = true;
  nextTick(() => {
    // 聚焦输入框，方便用户直接修改标题
    document.querySelector(".title-input input")?.focus();
  });
};

/**
 * 保存新的标题并同步到 Store。
 */
const saveTitle = () => {
  if (tempTitle.value.trim()) {
    sessionStore.updateTitle(tempTitle.value.trim());
  }
  isEditingTitle.value = false;
};

/**
 * 取消编辑，恢复原始标题。
 */
const cancelEditing = () => {
  isEditingTitle.value = false;
};

// 切换推理链显示状态
const toggleReason = (index) => {
  sessionStore.qiehuan(index);
};

// 获取指定索引位置的推理文本
const reasoningText = (index) => reasoningList.value[index] ?? "";

// 判断是否应该显示推理文本
const shouldDisplayReason = (index) => {
  const text = reasoningText(index);
  // 推理文本非空且推理链可见时，返回 true
  return text.trim() && (reasonVisibility.value[index] ?? false);
};

// 选择历史会话，将累加器中的内容添加到会话存储中并切换到指定会话
const selecthistory = (name) => {
  flushBuffer();
  sessionStore.selecthistory(name);
};

defineExpose({ selecthistory });
</script>

<template>
  <div class="header">
    <div class="header-title">
      <template v-if="!isEditingTitle">
        {{ sessionStore.curname }}
        <el-icon @click="startEditing"><EditPen /></el-icon>
      </template>
      <template v-else>
        <el-input
          v-model="tempTitle"
          class="title-input"
          size="small"
          @keyup.enter="saveTitle"
          @blur="saveTitle"
        />
        <el-icon @click="cancelEditing"><Close /></el-icon>
      </template>
    </div>
    <el-select
      v-model="selectedModel"
      size="small"
      class="model-select"
      :disabled="isTyping"
      placeholder="选择模型"
      :teleported="false"
    >
      <el-option
        v-for="option in modelOptions"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
  </div>

  <!-- 消息列表，虚拟滚动容器，用于高效渲染长列表 -->
  <DynamicScroller
    class="content"
    :items="messages"
    :min-item-size="120"
    key-field="_key"
    :key="sessionStore.curname"
  >
    <!-- 消息列表项模板，用于渲染每个消息，包含用户和助手的消息 -->
    <template #default="{ item, index, active }">
      <DynamicScrollerItem
        :item="item"
        :active="active"
        :data-index="index"
        :size-dependencies="[item.content, reasoningText(index), shouldDisplayReason(index)]"
      >
        <div
          class="message-row"
          :class="item.role === 'user' ? 'is-user' : 'is-assistant'"
        >
          <img
            class="message-avatar"
            :src="avatarForRole(item.role)"
            :alt="item.role === 'user' ? '用户头像' : 'AI头像'"
          />
          <div
            class="message"
            :class="item.role === 'user' ? 'user-message' : 'assistant-message'"
          >
            <div class="message-header">
              <span class="message-role">{{ item.role === 'user' ? '我' : 'DeepSeek' }}</span>
              <div class="message-actions">
                <el-tooltip content="复制纯文本" placement="top">
                  <button @click="copyMessage(item.content)" class="action-btn">
                    <el-icon><CopyDocument /></el-icon>
                  </button>
                </el-tooltip>
                <el-tooltip
                  v-if="item.role === 'assistant'"
                  content="复制全文"
                  placement="top"
                >
                  <button
                    @click="copyMessageMarkdown(item.content)"
                    class="action-btn"
                  >
                    <el-icon><DocumentCopy /></el-icon>
                  </button>
                </el-tooltip>
                <el-tooltip
                  v-if="item.role === 'assistant'"
                  content="重新回复"
                  placement="top"
                >
                  <button @click="handleRegenerateMessage(index)" class="action-btn">
                    <el-icon><RefreshRight /></el-icon>
                  </button>
                </el-tooltip>
                <el-tooltip content="删除此消息" placement="top">
                  <button @click="handleDeleteMessage(index)" class="action-btn">
                    <el-icon><Delete /></el-icon>
                  </button>
                </el-tooltip>
              </div>
            </div>

            <div v-if="reasoningText(index).trim()" class="reasoning-header">
              <span>思考过程</span>
              <button class="reason-toggle" @click="toggleReason(index)">
                {{ shouldDisplayReason(index) ? '收起' : '展开' }}
              </button>
            </div>

            <div v-if="shouldDisplayReason(index)" class="reasoning-body">
              {{ reasoningText(index) }}
            </div>

            <div class="message-body" v-html="renderMarkdown(item.content)"></div>

            <!-- 附件预览组件，用于显示用户上传的文件 -->
            <AttachmentPreview
              v-if="item.attachments?.length"
              :attachments="item.attachments"
            />
          </div>
        </div>
      </DynamicScrollerItem>
    </template>
  </DynamicScroller>

  <!-- 输入区：同时支持文本、文件上传与语音输入 -->
  <ChatInput v-model:msg="msg" v-model:isTyping="isTyping" @submit="submit" />

  <!-- 新消息指示器 -->
  <div
    v-if="showNewMessageIndicator"
    class="new-message-indicator"
    @click="scrollToBottomOnClick"
  >
    新消息
  </div>
</template>

<style scoped>
.header {
  padding: 18px 24px;
  background: var(--color-panel);
  border-bottom: 1px solid var(--color-border);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-heading);
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-title {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.model-select {
  width: 220px;
}

.header .el-icon {
  cursor: pointer;
  color: var(--color-muted);
  transition: color 0.2s ease;
}

.header .el-icon:hover {
  color: var(--color-heading);
}

.title-input {
  width: 220px;
  max-width: 60%;
}

.content {
  flex: 1;
  overflow-y: auto;
  background: var(--color-panel-alt);
  padding: 32px 12%;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}

.message-row.is-user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--color-surface);
  padding: 6px;
  box-shadow: var(--shadow-soft);
}

.message {
  max-width: 70%;
  width: fit-content;
  padding: 16px 20px;
  border-radius: 18px;
  position: relative;
  box-shadow: var(--shadow-soft);
  animation: fadeIn 0.3s ease;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  word-break: break-word;
  color: var(--color-text-primary);
}

.message.user-message {
  background: var(--color-bubble-user);
  color: var(--color-accent-contrast);
  border: 1px solid var(--color-bubble-user-border);
}

.message.assistant-message {
  background: var(--color-elevated-surface);
  color: var(--color-text-primary);
}

.message-row.is-user .message-actions .action-btn {
  color: rgba(249, 250, 251, 0.8);
}

.message-row.is-user .message-actions .action-btn:hover {
  color: var(--color-accent-contrast);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.message-role {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: inherit;
}

.message-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.action-btn:hover {
  background: var(--color-reasoning-surface);
  color: var(--color-text-primary);
}

.message-row.is-user .action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.reasoning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--color-reasoning-surface);
  color: inherit;
  font-size: 13px;
  margin-bottom: 8px;
}

.reason-toggle {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.reason-toggle:hover {
  text-decoration: underline;
}

.reasoning-body {
  padding: 12px;
  border-radius: 10px;
  background: var(--color-reasoning-contrast);
  border: 1px solid var(--color-reasoning-border);
  margin-bottom: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: inherit;
}

.message.user-message .reasoning-header,
.message.user-message .reasoning-body {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.22);
}

.message-body :deep(p) {
  margin: 0.5em 0;
}

.message-body :deep(a) {
  color: var(--color-link);
}

.message-body :deep(a:hover) {
  text-decoration: underline;
  color: var(--color-link-hover);
}

.message-body :deep(code:not(.hljs)) {
  background: var(--color-code-surface);
  padding: 0.2em 0.4em;
  border-radius: 4px;
}

.content :deep(pre) {
  position: relative;
  background: var(--color-code-surface);
  border: 1px solid var(--color-code-border);
  border-radius: 10px;
  padding: 16px;
  margin: 16px 0;
  overflow-x: auto;
}

.content :deep(code.hljs) {
  background: transparent;
  padding: 0;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 14px;
  color: var(--color-text-primary);
}

.content :deep(pre)::before {
  content: "代码";
  display: block;
  font-size: 12px;
  color: var(--color-code-label);
  margin-bottom: 8px;
}

.content :deep(.copy-btn) {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--color-copy-button-bg);
  color: var(--color-accent-contrast);
  border: none;
  cursor: pointer;
  font-size: 12px;
}

.content :deep(.copy-btn:hover) {
  background: var(--color-copy-button-hover);
}

.new-message-indicator {
  position: fixed;
  bottom: 80px;
  right: 24px;
  background: var(--color-new-indicator-bg);
  color: var(--color-accent-contrast);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  box-shadow: var(--shadow-strong);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.new-message-indicator:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-strong);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.vue-recycle-scroller__item-view {
  margin: 0 !important;
}

.content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  background: var(--color-table-bg);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--color-table-border);
  font-size: 14px;
}

.content :deep(th),
.content :deep(td) {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--color-table-border);
}

.content :deep(th) {
  background: var(--color-table-header-bg);
  font-weight: 600;
  color: var(--color-heading);
}

.content :deep(tr:last-child td) {
  border-bottom: none;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: var(--color-scroll-track);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: var(--color-scroll-thumb);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-scroll-thumb-hover);
}

@media (max-width: 960px) {
  .content {
    padding: 24px 24px;
  }

  .message {
    max-width: 85%;
  }
}

@media (max-width: 640px) {
  .content {
    padding: 20px 16px;
  }

  .message-row {
    gap: 12px;
  }

  .message {
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  .header {
    padding: 14px 18px;
    font-size: 16px;
  }

  .title-input {
    width: 180px;
  }

  .content {
    padding: 18px 12px;
  }

  .message-avatar {
    width: 36px;
    height: 36px;
    padding: 4px;
  }

  .message {
    padding: 14px 16px;
  }

  .message-actions {
    gap: 4px;
  }
}
</style>
