<style src="@/assets/main.css"></style>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import ChatMessage from "@/views/chatMessage.vue";
import ConversationSidebar from "@/components/chat/ConversationSidebar.vue";
import { useThemeStore } from "@/stores/theme";
import { useSessionStore } from "@/stores/session";
import { Close, Menu } from "@element-plus/icons-vue";

/**
 * 保存右侧对话面板的组件引用，方便在侧边栏切换会话时
 * 调用内部暴露的方法来同步消息列表。
 */
const chatPanelRef = ref(null);
const themeStore = useThemeStore();
const sessionStore = useSessionStore();

const MOBILE_BREAKPOINT = 1024;

const isSidebarOpen = ref(false);
const isMobile = ref(false);

// 计算当前会话标题，默认值为 "DeepSeek 对话"
const currentConversationTitle = computed(
  () => sessionStore.curname || "DeepSeek 对话",
);

// 组件卸载时，清理主题相关资源并移除窗口 resize 事件监听器
onBeforeUnmount(() => {
  themeStore.cleanup();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", updateViewportMode);
  }
});

/**
 * 当侧边栏选中一个历史会话时，将事件继续传递给
 * ChatMessage 组件，从而刷新当前的消息内容。
 */
const handleHistorySelect = (conversation) => {
  // 调用 ChatMessage 组件的 selecthistory 方法，切换到指定会话
  chatPanelRef.value?.selecthistory(conversation);
  if (isMobile.value) {
    isSidebarOpen.value = false;
  }
};

// 更新视口模式，根据窗口宽度判断是否为移动设备
const updateViewportMode = () => {
  if (typeof window === "undefined") return;
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT;
  if (!isMobile.value) {
    isSidebarOpen.value = false;
  }
};

// 切换侧边栏打开状态，仅在移动设备上生效
const toggleSidebar = () => {
  if (!isMobile.value) return;
  isSidebarOpen.value = !isSidebarOpen.value;
};

// 关闭侧边栏，仅在移动设备上生效
const closeSidebar = () => {
  if (!isMobile.value) return;
  isSidebarOpen.value = false;
};

// 组件挂载时，初始化视口模式并添加窗口 resize 事件监听器
onMounted(() => {
  updateViewportMode();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", updateViewportMode, { passive: true });
  }
});
</script>

<template>
  <div class="app-shell" :class="{ 'is-sidebar-open': isSidebarOpen }">
    <header class="mobile-header">
      <!-- 移动端头部，包含切换侧边栏按钮和会话标题 -->
      <button
        class="mobile-header__action"
        type="button"
        @click="toggleSidebar"
        aria-label="切换会话列表"
      >
        <el-icon>
          <component :is="isSidebarOpen ? Close : Menu" />
        </el-icon>
      </button>
      <!-- 会话标题，显示当前选中的会话名称 -->
      <div class="mobile-header__title" :title="currentConversationTitle">
        {{ currentConversationTitle }}
      </div>
    </header>
    <!-- 包含侧边栏和对话面板 -->
    <div class="box">
      <!-- 侧边栏，包含历史会话列表 -->
      <div class="sideleft" :class="{ 'is-mobile-active': isSidebarOpen }">
        <ConversationSidebar @callR="handleHistorySelect" />
      </div>
      <!-- 对话面板，显示当前会话的消息内容 -->
      <div class="sideright">
        <ChatMessage ref="chatPanelRef" />
      </div>
    </div>
    <!-- 移动端侧边栏遮罩层，点击可以关闭侧边栏 -->
    <div
      v-if="isMobile && isSidebarOpen"
      class="mobile-overlay"
      @click="closeSidebar"
    ></div>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.box {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--color-app-background);
}

.mobile-header {
  display: none;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-panel);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 12;
}

.mobile-header__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: background-color 0.2s ease, color 0.2s ease;
}

.mobile-header__action:hover {
  background: var(--color-toolbar-bg);
  color: var(--color-heading);
}

.mobile-header__title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-heading);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sideleft {
  height: 100%;
  background: var(--color-sidebar-surface);
  width: 400px;
  border-right: 1px solid var(--color-border-strong);
}
.sideright {
  height: 100%;
  width: 100%;
  background: var(--color-panel-alt);
  display: flex;
  flex-direction: column;

  position: relative;
}

.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  z-index: 10;
}

@media (max-width: 1024px) {
  .box {
    flex: 1;
    position: relative;
  }

  .mobile-header {
    display: flex;
  }

  .sideleft {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(360px, 85vw);
    max-width: 100%;
    transform: translateX(-100%);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
    z-index: 11;
    box-shadow: none;
  }

  .sideleft.is-mobile-active {
    transform: translateX(0);
    box-shadow: 12px 0 32px rgba(15, 23, 42, 0.24);
  }

  .sideright {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .mobile-header {
    padding: 10px 14px;
  }

  .mobile-header__action {
    width: 36px;
    height: 36px;
  }

  .mobile-header__title {
    font-size: 15px;
  }
}
</style>
