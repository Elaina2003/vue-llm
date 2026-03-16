import { computed, ref } from "vue";
import { defineStore } from "pinia";

const THEME_STORAGE_KEY = "theme";

export const useThemeStore = defineStore("theme", () => {
  const mode = ref("light");
  let mediaQuery;

  // 工具函数：根据主题值应用主题
  // 如果调用 applyTheme() 不传参数，它就自动用当前 mode 的值
  const applyTheme = (value = mode.value) => {
    if (typeof document === "undefined") return;
    // 拿到网页最外层的 <html> 标签
    const root = document.documentElement;
    // 把主题值设置到 <html> 标签的 data-theme 属性上
    root.dataset.theme = value;
    // classList.toggle(类名, 条件)，切换 dark 类名，实现深色主题
    // 如果 value === "dark" 是 true ，它就给 <html> 加上 dark 类名
    // 如果 value === "dark" 是 false ，它就从 <html> 移除 dark 类名
    root.classList.toggle("dark", value === "dark");
  };

  // 工具函数：设置主题模式
  const setMode = (value) => {
    // 确保值合法
    const normalized = value === "dark" ? "dark" : "light";
    if (mode.value === normalized) {
      applyTheme(normalized);
      return;
    }
    mode.value = normalized;
    applyTheme(normalized);
  };

  // 工具函数：切换主题
  const toggleMode = () => {
    setMode(mode.value === "dark" ? "light" : "dark");
  };

  // 工具函数：处理系统主题变化
  // 当你的电脑系统（比如 Windows 或 macOS）从浅色切换到深色时，网页要不要跟着变？
  const handleSystemChange = (event) => {
    if (typeof localStorage !== "undefined") {
      // 去 localStorage 里看一眼，用户之前有没有手动点过皮肤切换按钮？
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored) {
        // 用户已选择主题时，本页面不自动跟随系统
        return;
      }
    }
    // 如果用户没有手动选择主题，根据系统偏好设置来设置主题
    setMode(event.matches ? "dark" : "light");
  };

  // 工具函数：初始化主题
  // 当页面加载时，调用 initialize() 来设置初始主题
  const initialize = () => {
    if (typeof window === "undefined") {
      return;
    }

    let storedMode;
    if (typeof localStorage !== "undefined") {
      try {
        // 尝试从 localStorage 里读取用户之前的主题选择
        storedMode = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY))?.mode;
      } catch {
        // 如果读取失败，设为 null
        storedMode = null;
      }
    }

    // 如果用户之前有选择过主题，就用之前的选择
    if (storedMode === "light" || storedMode === "dark") {
      mode.value = storedMode;
    } else {
      // 如果用户之前没有选择过主题，根据系统偏好设置来设置主题
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      mode.value = prefersDark ? "dark" : "light";
    }
    // 把最终的主题值涂在 <html> 标签上
    applyTheme();

    // 监听系统主题变化，当系统切换到深色或浅色时，自动切换网页主题
    if (window.matchMedia) {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      // 如果用户突然去系统设置里把模式改了，这个监听器就会触发 handleSystemChange ，让网页跟着变
      if (mediaQuery?.addEventListener) {
        mediaQuery.addEventListener("change", handleSystemChange);
      } else if (mediaQuery?.addListener) {
        mediaQuery.addListener(handleSystemChange);
      }
    }
  };

  // 工具函数：清理主题监听,资源释放
  // 当组件卸载时，调用 cleanup() 来移除事件监听器，避免内存泄漏
  const cleanup = () => {
    if (mediaQuery?.removeEventListener) {
      mediaQuery.removeEventListener("change", handleSystemChange);
    } else if (mediaQuery?.removeListener) {
      mediaQuery.removeListener(handleSystemChange);
    }
  };

  // 计算属性：是否为深色主题
  const isDark = computed(() => mode.value === "dark");

  return {
    mode,
    isDark,
    initialize,
    cleanup,
    toggleMode,
    setMode,
    applyTheme,
  };
}, {
  persist: true,
});
