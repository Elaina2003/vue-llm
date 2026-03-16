// src/utils/MarkdownWorker.js

// 这个组件把耗时的 Markdown 渲染工作搬到浏览器的“后台线程”（Web Worker）中去执行，
// 防止界面因为处理大量文字而卡顿

// 🔧 导出一个类，用于在 Web Worker 中渲染 Markdown 文本
export default class MarkdownWorker {

    // 构造函数：创建 Web Worker 实例，初始化回调仓库和请求 ID 计数器
    constructor() {
        // 创建一个 Web Worker 实例，加载 @/workers/markdown.worker.js 脚本
        this.worker = new Worker(new URL('@/workers/markdown.worker.js', import.meta.url));
        // 用于存储每个请求的回调函数，key 是请求 ID，value 是包含 resolve 和 reject 方法的对象
        this.callbacks = new Map();
        // 当前请求 ID 计数器，用于唯一标识每个请求
        this.currentId = 0;

        // 监听从后台 Web Worker 传回来的消息
        this.worker.onmessage = (event) => {
            // 从后台传回来的消息里提取请求 ID、渲染结果、错误信息
            const { id, result, error } = event.data;
            // 拿着请求 ID去 callbacks 仓库里找，看看是谁在等这个结果
            const callback = this.callbacks.get(id);

            if (callback) {
                // 如有错误，调用 reject ，告诉前面的 Promise “渲染失败了”
                if (error) {
                    callback.reject(new Error(error));
                // 如果成功，调用 resolve ，把漂亮的 HTML 结果传回去
                } else {
                    callback.resolve(result);
                }
                // 渲染完成后，从 callbacks 仓库里移除这个请求的回调函数
                this.callbacks.delete(id);
            }
        };
    }

    // 核心功能是： 把原本杂乱的“异步消息传递”，包装成一个干净、好用的 Promise
    render(raw) {
      // 每次调用 render 方法，都创建一个新的 Promise
        return new Promise((resolve, reject) => {
            const id = ++this.currentId;
            // 把这个 Promise 的 resolve 和 reject 方法，存储到 callbacks 仓库里，
            // 用请求 ID 作为键，方便后续查找
            this.callbacks.set(id, { resolve, reject });
            // 把原始的 Markdown 文本，发送给 Web Worker 去处理
            this.worker.postMessage({ id, raw });
        });
    }

    // 当组件销毁时，调用 terminate 方法，终止 Web Worker 并清空 callbacks 仓库
    terminate() {
        this.worker.terminate();
        this.callbacks.clear();
    }
}
