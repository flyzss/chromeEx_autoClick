# Chrome 扩展程序开发规划：定时点击、监听、整理与提交

## 一、核心组件与功能

1.  **用户界面 (UI) - Popup 弹窗 (`popup.html`, `popup.js`, `popup.css`)**
    *   **配置输入区：**
        *   目标网页URL（可选）：如果需要扩展自动导航到特定页面。
        *   按钮选择器：用户输入用于定位页面按钮的CSS选择器或XPath表达式。
        *   监听的服务器URL/模式：用户指定需要监听其响应的URL或URL匹配模式（例如，`*://api.example.com/data*`）。
        *   数据提交URL：用户指定处理后的数据要提交到的URL。
        *   定时周期：用户设置执行操作的频率（例如，每X秒/分钟）。
        *   数据整理方法/脚本：
            *   选项1 (简单)：提供下拉菜单选择预设的整理逻辑（如：提取特定JSON字段、文本替换等）。
            *   选项2 (高级)：提供一个文本区域，允许用户输入一小段JavaScript代码来自定义数据处理逻辑。
    *   **控制区：**
        *   “启动” / “停止” 按钮。
        *   当前状态显示（例如：未运行、运行中、错误、下次执行时间）。
    *   **日志/反馈区（可选）：** 显示操作日志或错误信息。

2.  **后台脚本 (`background.js` 或 Service Worker for Manifest V3)**
    *   **配置管理：**
        *   使用 `chrome.storage.local` 或 `chrome.storage.sync` 来保存和读取用户的配置信息。
    *   **定时器核心：**
        *   使用 `chrome.alarms` API 创建和管理定时任务。
    *   **任务调度与控制：**
        *   接收来自Popup的启动/停止指令。
        *   根据定时器触发，协调内容脚本执行点击操作。
    *   **网络请求监听：**
        *   使用 `chrome.webRequest` API (如 `onCompleted`) 或 `chrome.debugger` API。
        *   根据用户配置的URL/模式过滤网络请求。
        *   获取并解析服务器返回的响应数据。
    *   **数据整理引擎：**
        *   根据用户选择的预设逻辑或执行用户提供的JavaScript代码来处理捕获到的数据。
        *   安全考量：如果执行用户自定义JS，确保其在安全沙箱环境中运行。
    *   **数据提交模块：**
        *   使用 `fetch` API 将整理后的数据异步POST到用户指定的URL。
        *   处理提交成功或失败的情况，并记录日志。
    *   **与内容脚本通信：** 使用 `chrome.runtime.sendMessage` 和 `chrome.tabs.sendMessage`。

3.  **内容脚本 (`content.js`)**
    *   **注入时机：** 当用户导航到匹配的网页时（或根据需要动态注入）。
    *   **按钮定位与点击：**
        *   接收后台脚本的指令。
        *   使用用户提供的选择器 (`document.querySelector` 或 XPath) 找到目标按钮。
        *   执行 `button.click()`。
        *   向后台脚本反馈点击结果。
    *   **数据提取 (辅助，可选)：** 如果部分数据需要直接从页面DOM中提取。

## 二、Manifest 文件 (`manifest.json`)

*   **`manifest_version`**: 3 (推荐) 或 2。
*   **`name`**, **`version`**, **`description`**
*   **`permissions`**:
    *   `storage`
    *   `alarms`
    *   `activeTab` (或更具体的URL权限)
    *   `scripting` (Manifest V3)
    *   `webRequest` (或 `debugger`)
    *   Host permissions (例如 `"*://*.example.com/*"` 或 `"<all_urls>"`)
*   **`host_permissions`**: (Manifest V3) 替代一部分 `permissions` 中的URL权限。
*   **`background`**:
    *   `service_worker`: (Manifest V3) 指定后台Service Worker脚本。
    *   `scripts`: (Manifest V2) 指定后台脚本。
*   **`content_scripts`**:
    *   `matches`: 指定内容脚本注入的URL模式。
    *   `js`: 指定内容脚本文件。
*   **`action`** (Manifest V3) / **`browser_action`** (Manifest V2):
    *   `default_popup`: 指定Popup弹窗的HTML文件。
    *   `default_icon`: 扩展图标。
*   **`options_page` (可选):** 用于复杂配置。

## 三、数据流与交互逻辑

1.  **配置：** 用户在Popup中输入配置 -> `popup.js` 保存到 `chrome.storage`。
2.  **启动：** 用户点击“启动” -> `popup.js` 通知 `background.js`。
3.  **后台准备：** `background.js` 读取配置，设置 `chrome.alarms`，开始监听网络请求。
4.  **定时触发：** `chrome.alarms` 触发 -> `background.js` 协调操作。
5.  **指令下发：** `background.js` -> `content.js` 发送“点击按钮”指令。
6.  **按钮点击：** `content.js` 点击按钮，返回结果给 `background.js`。
7.  **监听响应：** `background.js` 捕获服务器响应数据。
8.  **数据整理：** `background.js` 处理数据。
9.  **数据提交：** `background.js` 发送数据到用户指定URL。
10. **反馈与日志：** 记录操作结果和错误。
11. **停止：** 用户点击“停止” -> `popup.js` 通知 `background.js` -> `background.js` 清除定时器并停止监听。

## 四、关键技术点与潜在挑战

1.  **按钮选择器的鲁棒性。**
2.  **获取网络响应体 (Manifest V3 vs V2)。**
3.  **用户自定义数据整理脚本的安全性。**
4.  **异步操作管理 (`Promise`, `async/await`)。**
5.  **目标网页的复杂性 (`iframe`, Shadow DOM, SPA)。**
6.  **错误处理与用户反馈。**
7.  **Manifest V3 的适配。**

## 五、开发步骤建议

1.  **基础搭建：** `manifest.json`, Popup, `background.js`框架, `storage`。
2.  **核心点击功能：** `alarms`, `content.js` 点击, 通信。
3.  **网络监听与数据捕获：** `webRequest` 或 `debugger`。
4.  **数据整理引擎：** 预设逻辑，然后用户自定义JS。
5.  **数据提交：** `fetch` POST。
6.  **完善UI与交互：** 状态显示、错误提示。
7.  **安全性强化：** 用户自定义JS沙箱。
8.  **全面测试。**

## 六、代码规范

1.  **注释：** 要求每行代码都有注释，注释要清晰
2.  **变量命名：** 要求变量命名要清晰，有语义
3.  **函数：** 要求函数尽可能细分，做到职责单一




