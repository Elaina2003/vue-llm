import { ref } from "vue";
import { defineStore } from "pinia";

// 默认会话名称，用于初始化以及兜底
const DEFAULT_SESSION_NAME = "新对话";

const MODEL_OPTIONS = Object.freeze([
  {
    label: "DeepSeek Reasoner（推理增强）",
    value: "deepseek-reasoner",
  },
  {
    label: "DeepSeek Chat（快速对话）",
    value: "deepseek-chat",
  },
]);

// 附件大小转换工具函数
const formatFileSize = (size) => {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
};

// 将附件对象描述为更易读的字符串，方便拼接到模型上下文
const describeAttachment = (attachment) => {
  if (!attachment) return "";
  const { name, size, type, body, note } = attachment;
  const header = [`文件名: ${name}`, `大小: ${formatFileSize(size)}`];
  if (type) {
    header.push(`类型: ${type}`);
  }

  const bodyText = body ? `内容预览:\n${(body || "").slice(0, 4000)}` : note || "未提供内容";

  return `${header.join(" | ")}\n${bodyText}`;
};

// 开始定义 pinia store
export const useSessionStore = defineStore(
  "session",
  () => {
    // 所有会话的消息都存在这里
    const session = ref({ [DEFAULT_SESSION_NAME]: [] });
    // 当前打开的是哪个会话，默认就是「新对话」
    const curname = ref(DEFAULT_SESSION_NAME);
    // 记录每个会话的「最后活跃时间戳」
    const time = ref({});
    // 存储深度推理模型的「思考链」文本
    const reason = ref({ [DEFAULT_SESSION_NAME]: [] });
    // 记录每条思考链是否展开
    const showreason = ref({ [DEFAULT_SESSION_NAME]: [] });
    // 控制左侧历史列表里要不要显示这个会话，默认隐藏
    const visibility = ref({ [DEFAULT_SESSION_NAME]: false });
    // 如果用户点了「新建对话」但还没发第一条消息，就先记在这里，避免无限创建空会话
    const pendingConversation = ref(DEFAULT_SESSION_NAME);
    // 当前选中的模型，默认就是第一个推理模型
    const model = ref(MODEL_OPTIONS[0].value);

    // 如果默认会话已经有消息，就在左侧显示它，并把 pending 清空
    if ((session.value[DEFAULT_SESSION_NAME]?.length ?? 0) > 0) {
      visibility.value[DEFAULT_SESSION_NAME] = true;
      pendingConversation.value = null;
    }

    /**
     * 确保某个会话的相关数据结构已初始化，避免访问 undefined。
     */

    //工具函数：如果某个会话不存在，就给它造好空数组、空对象，防止后面读 undefined
    const ensureConversation = (name = curname.value, { makeVisibleIfNew = true } = {}) => {
      // 先看消息数组有没有
      const exists = !!session.value[name];
      // 没有就给空数组
      if (!exists) {
        session.value[name] = [];
      }
      // 同理，看推理链
      if (!reason.value[name]) {
        reason.value[name] = [];
      }
      // 同理，看是否展开推理链
      if (!showreason.value[name]) {
        showreason.value[name] = [];
      }
      //已存在会话就用现在时间，不存在就写 0
      if (time.value[name] === undefined) {
        time.value[name] = exists ? Date.now() : 0;
      }
      // 只要会话里面有消息就默认显示在左边
      if (visibility.value[name] === undefined) {
        visibility.value[name] = session.value[name].length > 0;
      }
      // 如果调用者明确说「不要自动显示」，就把 visibility 压成 false，并记到 pending 里
      if (!exists && !makeVisibleIfNew) {
        visibility.value[name] = false;
        pendingConversation.value = name;
      }
      //否则新会话就自动显示
      else if (!exists) {
        visibility.value[name] = true;
      }
      // 结束 ensureConversation确认会话不存在情况
    };

    //工具函数，自动生成「新对话 2」「新对话 3」... 避免重名
    const generateConversationName = () => {
      const base = DEFAULT_SESSION_NAME;
      // 如果「新对话」这个标题还没被占用，就直接用
      if (!session.value[base]) {
        return base;
      }

      // 拼接字符串自动生成新对话 2」「新对话 3」...
      let index = 1;
      let candidate = `${base} ${index}`;
      while (session.value[candidate]) {
        index += 1;
        candidate = `${base} ${index}`;
      }
      return candidate;
    };

    /**
     * 反转指定消息的思考链显示状态。
     */

    // 点「展开/收起」思考链时，把对应索引的布尔值取反；如果还没初始化就当成 true。
    const toggleReasonVisibility = (index) => {
      ensureConversation();
      const key = curname.value;
      if (showreason.value[key][index] === undefined) {
        showreason.value[key][index] = true;
      }
      showreason.value[key][index] = !showreason.value[key][index];
    };

    /**
     * 向当前会话追加一条消息，同时记录最近活跃时间。
     */
    const sessionpush = (msg) => {
      const key = curname.value;
      ensureConversation(key);
      // 确保消息对象符合 AI 接口标准，规范字段名和值类型
      const normalized = {
        role: msg.role,
        content: msg.content ?? "",
        attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
      };
      // 把一条消息规范化后推进session数组，同时刷新活跃时间、设为可见，并清掉 pending 标记
      session.value[key].push(normalized);
      time.value[key] = Date.now();
      visibility.value[key] = true;
      if (pendingConversation.value === key) {
        pendingConversation.value = null;
      }
    };

    // 给推理模型追加一条思考链文本，默认展开状态为 true
    const reasonadd = (reasonmsg) => {
      const key = curname.value;
      ensureConversation(key);
      reason.value[key].push(reasonmsg);
      showreason.value[key].push(true);
    };

    // 切换模型，先校验值是否在白名单里，防止乱写。
    const setModel = (value) => {
      const exists = MODEL_OPTIONS.some((option) => option.value === value);
      if (exists) {
        model.value = value;
      }
    };

    /**
     * 返回所有可见会话的名称列表。
     */

    // 侧边栏要展示的历史列表：把 visibility 不是 false 的会话名筛出来
    const getAllSessions = () =>
      Object.keys(session.value).filter((name) => {
        if (visibility.value[name] === undefined) {
          visibility.value[name] = session.value[name].length > 0;
        }
        return visibility.value[name] !== false;
      });

    /**
     * 创建一个空白会话，标记为待输入状态。
     */

    // 手动造一个空会话，visibility 先 false，等用户发第一条消息再 true
    const createBlankConversation = (name) => {
      session.value[name] = [];
      reason.value[name] = [];
      showreason.value[name] = [];
      time.value[name] = 0;
      visibility.value[name] = false;
      pendingConversation.value = name;
    };

    /**
     * 清空所有历史记录并创建新的占位会话。
     */

    // 一键「清空所有」：把全部对象归零，再生成一个新空会话并切过去
    const clear = () => {
      session.value = {};
      reason.value = {};
      showreason.value = {};
      time.value = {};
      visibility.value = {};
      const name = generateConversationName();
      createBlankConversation(name);
      curname.value = name;
    };

    /**
     * 更新当前会话标题，若目标标题已存在则切换到该会话。
     */
    const updateTitle = (newTitle) => {
      const trimmed = newTitle?.trim();
      // 空标题直接忽略
      if (!trimmed) {
        return;
      }

      const current = curname.value;
      // 名字没变也直接返回
      if (trimmed === current) {
        return;
      }

      if (session.value[trimmed]) {
        // 如果目标标题已存在，就直接切换过去，不重复创建
        curname.value = trimmed;
        visibility.value[trimmed] = true;
        pendingConversation.value = null;
        return;
      }
      // 确保源会话数据结构完整
      ensureConversation(current);
      //把源会话的全部数据搬到新 key 名下（浅拷贝引用）
      session.value[trimmed] = session.value[current];
      reason.value[trimmed] = reason.value[current];
      showreason.value[trimmed] = showreason.value[current];
      if (time.value[current]) {
        time.value[trimmed] = time.value[current];
      }

      visibility.value[trimmed] = true;
      //  搬完再把旧 key 删掉，实现 updateTitle的「重命名」效果
      delete session.value[current];
      delete reason.value[current];
      delete showreason.value[current];
      delete time.value[current];
      delete visibility.value[current];

      // 最后切到新名字，并清掉 pending
      curname.value = trimmed;
      pendingConversation.value = null;
    };

    // 删除单条消息：同时把对应的思考链、展开状态也删掉；如果删光了就把活跃时间清零
    const removeMessageAt = (index) => {
      ensureConversation();
      const key = curname.value;
      const messages = session.value[key];
      if (!messages || index < 0 || index >= messages.length) {
        return;
      }

      messages.splice(index, 1);
      reason.value[key]?.splice(index, 1);
      showreason.value[key]?.splice(index, 1);

      if (!messages.length) {
        time.value[key] = 0;
      }
    };

    // 点「重新生成」时用到：把 startIndex 及之后下文全部砍掉，保留上文
    const trimMessagesFrom = (startIndex) => {
      ensureConversation();
      const key = curname.value;
      const messages = session.value[key];
      // 安全检查：如果没消息或者给的序号是负数，直接返回，啥也不干
      if (!messages || startIndex < 0) {
        return;
      }
      // 如果你要开始删的序号，确实在消息列表范围内
      if (startIndex < messages.length) {
        // 只保留从 0 到 startIndex 的内容，后面的全扔掉
        session.value[key] = messages.slice(0, startIndex);
        // 对应的“思考过程”和“展开状态”也必须同步删掉
        reason.value[key] = (reason.value[key] ?? []).slice(0, startIndex);
        showreason.value[key] = (showreason.value[key] ?? []).slice(0, startIndex);
      }
    };

    // 删除整个会话
    const deletehistory = (name) => {
      const wasCurrent = name === curname.value;
      delete session.value[name];
      delete time.value[name];
      delete reason.value[name];
      delete showreason.value[name];
      delete visibility.value[name];
      // 如果这个对话正好是“待定”状态，清除待定状态
      if (pendingConversation.value === name) {
        pendingConversation.value = null;
      }
      // 拿到剩下还没被删的所有对话的名字
      const remaining = Object.keys(session.value);
      // 如果你刚才删掉的确实是正在看的对话，那我们得找个新的对话显示
      if (wasCurrent) {
        const fallback = remaining
          // 把名字和它的更新时间配对
          .map((key) => ({ key, updatedAt: time.value[key] ?? 0 }))
          // 一个常用的排序写法。 b - a 表示降序（从大到小），这样时间戳最大的（也就是最近的）就会排在第一个
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.key;

        // 如果找到了备选对话，确保它的数据结构完整，切换过去
        if (fallback) {
          ensureConversation(fallback);
          curname.value = fallback;
          return;
        }
        // 如果连备选都没有了（说明你把最后一个对话也删了）
        // 那我们就创建一个新的对话，作为备用，强制切换到这个新对话
        const fallbackName = generateConversationName();
        createBlankConversation(fallbackName);
        curname.value = fallbackName;
      }
    };

    /**
     * 切换当前会话，必要时自动初始化数据。
     */

    // 侧边栏点击历史会话时调用：切过去并确保数据结构完整
    const selecthistory = (name) => {
      if (name && curname.value !== name) {
        ensureConversation(name);
        curname.value = name;
      }
    };

    /**
     * 获取当前会话的消息列表，附带虚拟滚动所需的 key。
     */

    // 获取并加工当前对话的消息列表：确保每条消息都有 role, content, attachments 等字段，且 attachments 是数组
    const getcurmsgs = () => {
      ensureConversation();
      // 取出当前对话的所有原始消息
      const currentMessages = session.value[curname.value];

      // 对每一条消息进行“加工”后返回一个新数组
      return currentMessages.map((item, idx) => ({
        // 展开运算符，把原始消息里的 role, content 等全部复制过来
        ...item,
        // 确保 attachments 字段一定是个数组，避免后续处理错误
        attachments: Array.isArray(item.attachments) ? item.attachments : [],
        // 添加一个 _key 字段，专门给虚拟滚动组件（DynamicScroller）使用
        _key: `${item.role}-${idx}`,
      }));
    };

    /**
     * 创建新的对话。当存在未使用的占位对话时直接切换过去。
     */

    // 开启一个新对话，先检查是否有可复用的“空白对话”
    // 如果有，就切换过去；如果没有，就创建一个新的对话
    const newchat = () => {
      // 检查是否有可复用的“空白对话”
      if (
        // 1. 是否存在一个被标记为“待定”的对话？
        pendingConversation.value &&
        // 2. 这个对话在数据里真的存在吗？
        session.value[pendingConversation.value] &&
        // 3. 关键：它的消息长度是不是 0？
        (session.value[pendingConversation.value]?.length ?? 0) === 0
      ) {
        // 如果以上条件都满足，说明这个对话是“空白的”，可以复用
        // 切换到这个对话，确保数据结构完整
        curname.value = pendingConversation.value;
        ensureConversation(curname.value, { makeVisibleIfNew: false });
        // 返回状态：没有新建，是复用
        return { created: false, name: curname.value };
      }

      // 如果上面的 if 不成立，说明没有可复用的“空白对话”
      // 那我们就创建一个新的对话，作为备用，强制切换到这个新对话
      const name = generateConversationName();
      createBlankConversation(name);
      curname.value = name;
      // 返回状态：确实新建了一个对话
      return { created: true, name };
    };

    /**
     * 将流式响应追加到最后一条消息中。
     */

    // adddelta 函数是实现 AI **“流式输出”（打字机效果）**的核心逻辑
    // 它的作用是：将 AI 模型返回的每一个字符（delta），追加到当前对话的最后一条消息中
    const adddelta = (delta) => {
      ensureConversation();
      const key = curname.value;
      const messages = session.value[key];
      // 找到最后一条消息
      const lastMessage = messages[messages.length - 1];

      if (lastMessage) {
        // 把新传进来的“字” (delta) 拼接到最后一条消息的内容后面
        lastMessage.content += delta;
      }
    };

    /**
     * 将推理文本追加到当前会话的最后一个思考链中。
     */

    // 同理，add 函数是实现 AI **“推理输出”（思考链效果）**的核心逻辑
    // 它的作用是：将 AI 模型返回的每一个推理步骤（delta），追加到当前对话的最后一个思考链中
    const add = (delta) => {
      ensureConversation();
      const key = curname.value;
      const reasoningList = reason.value[key];
      const last = reasoningList[reasoningList.length - 1];
      if (last !== undefined) {
        reasoningList[reasoningList.length - 1] = `${last}${delta}`;
      }
    };

    /**
     * 将消息和附件概述拼接成模型可读的输入。
     */

    // ：把我们在 UI 界面里看到的、包含附件对象的消息，转换成 AI 模型（如 DeepSeek）能听懂的 纯文本格式
    const getMessagesForModel = () => {
      ensureConversation();
      const key = curname.value;
      // 遍历当前对话的每一条消息
      return session.value[key].map((item) => {
        // 1. 处理附件：如果这条消息有附件，就把它转成文字描述
        const attachmentsText =
          item.attachments && item.attachments.length
            ? `\n\n附件:\n${item.attachments
                .map((attachment) => describeAttachment(attachment))
                .join("\n\n")}`
            : "";
        // 2. 拼接内容：把原始文字消息和附件描述拼接在一起
        const content = `${item.content ?? ""}${attachmentsText}`.trim();

        // 3. 返回符合 AI 接口标准的格式
        // 每个消息对象都包含 role（角色）和 content（内容）两个字段
        // role 可以是 "user"（用户）或 "assistant"（助手）
        // content 是消息的具体文本内容
        return {
          role: item.role,
          content: content || "(空消息)",
        };
      });
    };

    // pinia的出口
    return {
      // 会话数据：存储所有对话的消息和思考链
      session,
      // 当前对话名称：记录用户当前正在与哪个对话互动
      curname,
      // 会话推送：用于将新消息添加到当前对话
      sessionpush,
      // 获取当前对话的所有消息
      getcurmsgs,
      // 添加流式响应：用于将 AI 模型返回的每一个字符（delta），追加到当前对话的最后一条消息中
      adddelta,
      // 获取所有会话：返回所有对话的名称列表
      getAllSessions,
      // 新建对话：创建一个新的对话，切换到它
      newchat,
      // 清空所有历史对话：删除所有对话的消息和思考链，重新初始化一个干净的对话
      clear,
      // 删除某个对话：从存储中删除指定对话，如果删掉的是当前正在看的对话，就立刻开启一个新对话
      deletehistory,
      // 选择历史对话：切换到指定的历史对话
      selecthistory,
      // 记录对话开始时间：用于显示对话的开始时间
      time,
      // 更新对话标题：允许用户自定义对话的名称
      updateTitle,
      // 添加推理文本：用于将 AI 模型返回的每一个推理步骤（delta），追加到当前对话的最后一个思考链中
      reasonadd,
      // 推理链：存储当前对话的所有推理步骤
      reason,
      // 添加推理文本：用于将 AI 模型返回的每一个推理步骤（delta），追加到当前对话的最后一个思考链中
      add,
      // 显示推理链：控制是否显示当前对话的推理链
      showreason,
      // 切换推理链显示状态：点击按钮时，切换是否显示当前对话的推理链
      qiehuan: toggleReasonVisibility,
      // 把当前对话的消息和附件，拼接成 AI 模型（如 DeepSeek）能听懂的 纯文本格式
      getMessagesForModel,
      // 对话可见性：记录每个对话是否当前正在显示在 UI 中
      visibility,
      // 待处理对话：记录当前正在与 AI 模型互动的对话，用于处理流式响应
      pendingConversation,
      // 删除单个消息：用于在处理流式响应时，删除临时存储的消息
      removeMessageAt,
      // 从指定索引开始，删除所有后续消息：用于在处理流式响应时，删除临时存储的消息
      trimMessagesFrom,
      // 当前模型：记录用户当前正在使用的 AI 模型（如 DeepSeek）
      model,
      // 模型选项：存储推理模型和对话模型
      modelOptions: MODEL_OPTIONS,
      // 设置模型：允许用户切换到不同的 AI 模型
      setModel,
    };
  },
  {
    persist: true,
  },
);
