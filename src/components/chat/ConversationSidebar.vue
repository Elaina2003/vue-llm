<!-- 这个组件是聊天会话左侧边栏，用于展示历史对话记录、搜索和新建对话 -->

<template>
  <aside class="sidebar">
    <!-- 左侧栏头部，包含品牌标识、主题切换和新建对话按钮 -->
    <header class="sidebar-header">
      <div class="brand-row">
        <div class="brand">
          <span class="brand__title">DeepSeek</span>
          <span class="brand__subtitle">智能对话助手</span>
        </div>
        <el-button text class="theme-toggle" @click="toggleTheme">
          <el-icon class="theme-toggle__icon">
            <component :is="isDark ? Sunny : Moon" />
          </el-icon>
          <span>{{ isDark ? "日间模式" : "夜间模式" }}</span>
        </el-button>
      </div>
      <el-button type="primary" class="new-chat-btn" @click="newChat">
        <el-icon><Plus /></el-icon>
        <span>新建对话</span>
      </el-button>
    </header>

    <!-- 历史记录工具区：搜索框 + 统计信息 -->
    <div class="sidebar-tools">
      <el-input
        v-model="keyword"
        placeholder="搜索历史对话"
        clearable
        :prefix-icon="Search"
        class="search-input"
      />
      <div class="sidebar-stats">
        <span>共 {{ filteredConversations.length }} 个对话</span>
        <el-button
          text
          size="small"
          class="clear-btn"
          @click="clearHistory"
        >
          <el-icon><Delete /></el-icon>
          清空
        </el-button>
      </div>
    </div>

    <!-- 历史会话列表，使用虚拟滚动条保持体验 -->
    <el-scrollbar ref="listRef" class="conversation-list">
      <transition-group name="slide-fade" tag="div">
        <div
          v-for="conversation in filteredConversations"
          :key="conversation.name"
          :class="['conversation-item', { active: conversation.name === sessionStore.curname }]"
          @click="selectHistory(conversation.name)"
        >
          <div class="conversation-item__main">
            <div class="conversation-item__title">{{ conversation.name }}</div>
            <time class="conversation-item__time">{{ conversation.timeLabel }}</time>
          </div>
          <div class="conversation-item__preview">{{ conversation.preview }}</div>
          <div class="conversation-item__actions" @click.stop>
            <el-button
              text
              size="small"
              class="rename-btn"
              @click="renameConversation(conversation.name)"
            >
              <el-icon><EditPen /></el-icon>
            </el-button>
            <el-button
              text
              size="small"
              class="delete-btn"
              @click="deleteHistory(conversation.name)"
            >
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>
      </transition-group>

      <div v-if="!filteredConversations.length" class="empty-state">
        <el-icon class="empty-state__icon"><ChatDotRound /></el-icon>
        <p>暂无历史记录，点击“新建对话”开始吧！</p>
      </div>
    </el-scrollbar>
  </aside>
</template>

<script setup>
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, nextTick, ref } from "vue";

import {
  ChatDotRound,
  Close,
  Delete,
  EditPen,
  Moon,
  Plus,
  Search,
  Sunny,
} from "@element-plus/icons-vue";

import { useSessionStore } from "@/stores/session";
import { useThemeStore } from "@/stores/theme";

defineOptions({ name: "ConversationSidebar" });

const emit = defineEmits(["callR"]);
const sessionStore = useSessionStore();
const themeStore = useThemeStore();

const keyword = ref("");
const listRef = ref(null);

const isDark = computed(() => themeStore.mode === "dark");

const toggleTheme = () => {
  themeStore.toggleMode();
};

/**
 * 根据会话名称组装摘要信息，包括最后一条消息、更新时间等
 * 供侧边栏列表渲染使用。
 */
const conversations = computed(() => {
  const names = sessionStore.getAllSessions();
  return names.map((name) => {
    const messages = sessionStore.session[name] ?? [];
    const lastMessage = messages[messages.length - 1];
    const time = sessionStore.time[name] ?? 0;

    // 处理最后一条消息的附件名称，若有多个附件则用“、”连接
    const attachmentNames = Array.isArray(lastMessage?.attachments)
      ? lastMessage.attachments.map((item) => item.name).join("、")
      : "";

    // 生成对话预览文本，包含最后一条消息内容或附件名称（若有）
    const previewText = lastMessage?.content?.trim()
      ? lastMessage.content.replace(/\s+/g, " ")
      : attachmentNames
      ? `附件: ${attachmentNames}`
      : "空对话";

    return {
      name,
      updatedAt: time,
      preview: previewText.slice(0, 50),
    };
  });
});

/**
 * 结合搜索关键字过滤、排序会话，使最近的记录优先显示。
 */
const filteredConversations = computed(() => {
  // 赋值搜索关键字
  const query = keyword.value.trim().toLowerCase();
  // 返回过滤后的会话列表，包含时间标签，根据更新时间倒序排序
  return conversations.value
    .map((conversation) => ({
      ...conversation,
      timeLabel: formatTime(conversation.updatedAt),
    }))
    .filter((conversation) =>
      !query ||
      conversation.name.toLowerCase().includes(query) ||
      conversation.preview.toLowerCase().includes(query),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
});

/**
 * 将时间戳转换为可读的“刚刚/几分钟前”形式，提升可读性。
 */
const formatTime = (timestamp) => {
  if (!timestamp) return "未开始";
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  return new Date(timestamp).toLocaleString();
};

/**
 * 新建对话或切换到待输入的占位对话，并在成功创建后给出提示。
 */
const newChat = async () => {
  const { created } = sessionStore.newchat();
  keyword.value = "";
  await nextTick();
  listRef.value?.setScrollTop?.(0);
  if (created) {
    ElMessage.success("已创建新对话");
  } else {
    ElMessage.info("已切换到等待输入的新对话");
  }
};

/**
 * 清空所有历史记录，二次确认后调用 Pinia Store 的清理方法。
 */
const clearHistory = () => {
  if (!sessionStore.getAllSessions().length) {
    return;
  }

  ElMessageBox.confirm("确认清空全部对话记录吗？", "清空历史", {
    confirmButtonText: "清空",
    cancelButtonText: "取消",
    type: "warning",
    center: true,
  })
    .then(() => {
      sessionStore.clear();
      keyword.value = "";
      ElMessage.success("已清空历史对话");
    })
    .catch(() => {});
};

/**
 * 删除单个历史记录并展示成功提示。
 */
const deleteHistory = (name) => {
  sessionStore.deletehistory(name);
  ElMessage.success("对话已删除");
};

/**
 * 通知父组件切换当前会话，避免在侧边栏内直接修改消息列表。
 */
const selectHistory = (name) => {
  emit("callR", name);
};

/**
 * 触发重命名弹窗，校验输入后更新当前会话标题。
 */
const renameConversation = (name) => {
  ElMessageBox.prompt("请输入新的对话标题", "重命名对话", {
    inputValue: name,
    confirmButtonText: "保存",
    cancelButtonText: "取消",
    center: true,
  })
    .then(({ value }) => {
      if (!value.trim()) {
        ElMessage.warning("标题不能为空");
        return;
      }
      if (value === name) return;
      // 切换到新会话，更新标题
      sessionStore.selecthistory(name);
      sessionStore.updateTitle(value.trim());
      ElMessage.success("标题已更新");
    })
    .catch(() => {});
};
</script>

<style scoped>

.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 18px;
  background: var(--color-sidebar-surface);
  border-right: 1px solid var(--color-border-strong);
  color: var(--color-text-primary);
}

.sidebar-header {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.brand-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand__title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-heading);
}

.brand__subtitle {
  font-size: 12px;
  color: var(--color-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.theme-toggle {
  border-radius: 999px !important;
  padding: 6px 12px !important;
  height: auto !important;
  color: var(--color-text-secondary) !important;
  background-color: transparent !important;
  border: none !important;
  transition: background-color 0.2s ease, color 0.2s ease !important;
}

.theme-toggle:hover {
  color: var(--color-heading) !important;
  background-color: rgba(148, 163, 184, 0.16) !important;
}

.theme-toggle__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.theme-toggle span {
  font-size: 12px;
}

.new-chat-btn {
  width: 100%;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--color-accent-strong), var(--color-accent));
  border: none;
  box-shadow: var(--shadow-soft);
  color: var(--color-accent-contrast);
}

.new-chat-btn span {
  margin-left: 6px;
}

.sidebar-tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-input :deep(.el-input__wrapper) {
  border-radius: 14px;
  background: var(--color-input-background);
  border: 1px solid var(--color-border);
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
}

.sidebar-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--color-muted);
}

.clear-btn {
  color: var(--color-danger);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.clear-btn:hover {
  color: var(--color-danger-strong);
}

.conversation-list {
  flex: 1;
  overflow: hidden;
}

.conversation-item {
  position: relative;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  margin-bottom: 12px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  border: 1px solid transparent;
  color: inherit;
}

.conversation-item:last-child {
  margin-bottom: 0;
}

.conversation-item:hover {
  transform: translateX(4px);
  box-shadow: var(--shadow-strong);
}

.conversation-item.active {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-strong);
}

.conversation-item__main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.conversation-item__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item__time {
  font-size: 11px;
  color: var(--color-muted);
}

.conversation-item__preview {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  height: 3em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-item__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.conversation-item:hover .conversation-item__actions,
.conversation-item.active .conversation-item__actions {
  opacity: 1;
}

.rename-btn,
.delete-btn {
  color: var(--color-muted);
}

.rename-btn:hover,
.delete-btn:hover {
  color: var(--color-text-primary);
}

.empty-state {
  margin-top: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-muted);
  text-align: center;
}

.empty-state__icon {
  font-size: 32px;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

@media (max-width: 960px) {
  .sidebar {
    padding: 16px;
  }
}

@media (max-width: 1024px) {
  .sidebar {
    width: 100%;
    max-width: none;
    border-right: none;
    border-bottom: 1px solid var(--color-border-strong);
    box-shadow: none;
  }

  .sidebar-header {
    flex-direction: column;
    align-items: stretch;
  }

  .brand-row {
    align-items: flex-start;
  }

  .new-chat-btn {
    height: 42px;
  }

  .conversation-list {
    padding-bottom: 80px;
  }
}

@media (max-width: 640px) {
  .sidebar {
    padding: 16px 14px 24px;
  }

  .brand__title {
    font-size: 20px;
  }

  .conversation-item {
    padding: 12px 14px;
  }
}
</style>
