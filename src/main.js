import { createApp } from "vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import VueVirtualScroller from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

import App from "./App.vue";
import { useThemeStore } from "@/stores/theme";

// 创建应用实例以及 Pinia 状态管理
const app = createApp(App);
const pinia = createPinia();

// 让所有 Pinia Store 默认持久化，刷新后仍能记住会话记录
pinia.use(piniaPluginPersistedstate);

// 注册全局插件：长列表采用虚拟滚动以提升性能
app.use(VueVirtualScroller);
app.use(pinia);

// 初始化主题，在应用挂载前同步当前模式
const themeStore = useThemeStore(pinia);
themeStore.initialize();

// 挂载到页面根节点
app.mount("#app");
