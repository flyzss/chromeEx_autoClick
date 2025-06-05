// content.js
// 该脚本在匹配的网页上下文中运行，负责与页面DOM交互。

// console.log('内容脚本已加载。'); // 用于调试，确认脚本注入

/**
 * @description 监听来自background.js的消息，主要处理点击页面元素的指令
 * @param {Object} message - 消息对象，包含command和selector等信息
 * @param {Object} sender - 消息发送方信息
 * @param {Function} sendResponse - 回调函数，用于向发送方发送响应
 * @returns {boolean} 如果是异步处理则返回true，否则返回false
 */
// 监听来自 background.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 检查消息命令是否为 'clickButton'
  if (message.command === 'clickButton') {
    // 获取按钮选择器
    const selector = message.selector;
    // console.log(`内容脚本收到点击指令，选择器: ${selector}`); // 调试日志

    // 检查选择器是否为空
    if (!selector) {
      // console.error('错误: 选择器为空。'); // 调试日志
      sendResponse({ success: false, error: '选择器为空' }); // 发送失败响应
      return true; // 表示异步处理响应
    }

    try {
      // 尝试使用 querySelector 查找按钮
      let button = document.querySelector(selector);
      // 如果 querySelector 未找到，并且选择器可能为 XPath，则尝试使用 XPath
      // (这是一个简化的XPath检测，实际应用中可能需要更明确的指示或更健壮的解析)
      if (!button && (selector.startsWith('/') || selector.startsWith('./') || selector.startsWith('('))) {
        // console.log('尝试使用 XPath 定位按钮...'); // 调试日志
        const xpathResult = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        button = xpathResult.singleNodeValue;
      }

      // 检查按钮是否存在且可见
      if (button && (button instanceof HTMLElement)) {
        // console.log('按钮已找到:', button); // 调试日志
        // 检查按钮是否可见且可点击 (简单的可见性检查)
        const style = window.getComputedStyle(button);
        if (style.display === 'none' || style.visibility === 'hidden' || button.disabled) {
          // console.warn('警告: 按钮已找到但不可见或被禁用。', button); // 调试日志
          sendResponse({ success: false, error: '按钮已找到但不可见或被禁用' });
        } else {
          button.click(); // 执行点击操作
          // console.log('按钮已点击。'); // 调试日志
          sendResponse({ success: true }); // 发送成功响应
        }
      } else {
        // console.error('错误: 未找到匹配选择器的按钮或找到的不是元素。', selector); // 调试日志
        sendResponse({ success: false, error: '未找到匹配选择器的按钮' }); // 发送失败响应
      }
    } catch (e) {
      // console.error('点击按钮时发生错误:', e); // 调试日志
      sendResponse({ success: false, error: e.message }); // 发送错误响应
    }
    return true; // 表示异步处理响应，因为DOM操作和响应发送可能是异步的
  }
  return false; // 对于其他类型的消息，不作处理或同步处理
});
