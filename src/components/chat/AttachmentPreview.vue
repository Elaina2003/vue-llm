<!-- 这个组件用于展示用户发送的附件，在消息气泡中展示 -->

<template>
  <div v-if="attachments.length" class="attachment-list">
    <!-- 循环渲染每一个附件，使用 id 或文件名作为唯一 key -->
    <div v-for="file in attachments" :key="file.id || file.name" class="attachment-item">
      <div class="attachment-icon">
        <!-- 显示一个回形针图标 -->
        <el-icon><Paperclip /></el-icon>
      </div>
      <div class="attachment-content">
        <div class="attachment-title">
          <!-- 文件名 -->
          <span class="attachment-name">{{ file.name }}</span>
          <!-- 大小和类型 -->
          <span class="attachment-meta">
            {{ formatSize(file.size) }} · {{ file.type || "未知类型" }}
          </span>
        </div>
        <!-- 如果附件有正文，显示截断后的预览 -->
        <p v-if="file.body" class="attachment-preview">
          {{ truncate(file.body) }}
        </p>
        <!-- 如果附件有备注，显示备注内容 -->
        <p v-else-if="file.note" class="attachment-preview">
          {{ file.note }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Paperclip } from "@element-plus/icons-vue";
import { computed } from "vue";

const props = defineProps({
  attachments: {
    type: Array,
    default: () => [],
  },
  maxPreviewLength: {
    type: Number,
    default: 160,
  },
});

/**
 * 将外部传入的附件数组转为受控的计算属性，确保模板内访问安全。
 */
const attachments = computed(() => props.attachments ?? []);

/**
 * 文件大小显示助手，自动选择合适的单位。
 */
const formatSize = (size) => {
  if (!size && size !== 0) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
};

/**
 * 为附件正文提供安全的截断逻辑，避免超长文本撑开气泡。
 */
const truncate = (text = "") => {
  if (!text) return "";
  if (text.length <= props.maxPreviewLength) {
    return text;
  }
  // 超过长度加省略号
  return `${text.slice(0, props.maxPreviewLength)}…`;
};
</script>

<style scoped>
.attachment-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attachment-item {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--color-toolbar-bg);
  border: 1px solid rgba(59, 130, 246, 0.18);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
}

.attachment-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.18);
  color: var(--color-accent-strong);
}

.attachment-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--color-text-secondary);
}

.attachment-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.attachment-name {
  font-weight: 600;
  font-size: 14px;
  word-break: break-all;
}

.attachment-meta {
  font-size: 11px;
  color: var(--color-muted);
}

.attachment-preview {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
