// background.js (Service Worker)
// 该文件作为扩展的后台服务工作线程，处理核心逻辑。

// 定义一个常量作为定时器的名称
const ALARM_NAME = 'timedClickAndMonitorAlarm';
// 定义一个变量来存储当前配置
let currentConfig = {};
// 定义一个变量来跟踪任务是否正在运行
let isRunning = false;
// 定义一个变量来存储下一个计划运行的时间
let nextScheduledRunTime = null;

// 监听来自 popup.js 或 content.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 检查消息命令
  if (message.command === 'start') {
    // 如果命令是 'start'
    currentConfig = message.config; // 保存配置
    isRunning = true; // 设置运行状态为 true
    // 将运行状态保存到 storage，以便 popup 重新打开时能获取
    chrome.storage.local.set({ isRunning: true, currentConfig: currentConfig });
    // 创建定时器
    createAlarm(currentConfig.timerInterval);
    // 立即尝试执行一次任务（如果需要，或者等待定时器第一次触发）
    // 为了演示，我们让定时器首次触发时执行
    sendResponse({ status: 'started' }); // 向 popup 发送成功启动的响应
    updatePopupStatus(); // 更新 popup 状态
    logToPopup('任务已启动。');
    return true; // 表示异步处理响应
  } else if (message.command === 'stop') {
    // 如果命令是 'stop'
    stopAlarm(); // 停止定时器
    isRunning = false; // 设置运行状态为 false
    nextScheduledRunTime = null; // 清除下次运行时间
    // 将运行状态保存到 storage
    chrome.storage.local.set({ isRunning: false });
    sendResponse({ status: 'stopped' }); // 向 popup 发送成功停止的响应
    updatePopupStatus(); // 更新 popup 状态
    logToPopup('任务已停止。');
    return true; // 表示异步处理响应
  } else if (message.command === 'getStatus') {
    // 如果命令是 'getStatus'
    updatePopupStatus(sendResponse); // 更新 popup 状态并使用 sendResponse 回调
    return true; // 表示异步处理响应
  } else if (message.command === 'clickResult') {
    // 如果是来自 content.js 的点击结果
    if (message.success) {
      logToPopup(`按钮 '${currentConfig.buttonSelector}' 点击成功。`);
    } else {
      logToPopup(`错误: 点击按钮 '${currentConfig.buttonSelector}' 失败: ${message.error}`);
    }
    // 点击后可以继续监听网络请求，无需额外操作
  }
  return false; // 默认同步处理
});

/**
 * @description 创建定时器函数
 * @param {number} intervalInSeconds - 定时器间隔时间（秒）
 * @returns {void} 无返回值
 */
function createAlarm(intervalInSeconds) {
  // 清除可能已存在的同名定时器，以防重复创建
  chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
    // 使用 chrome.alarms.create 创建新的定时器
    // periodInMinutes 需要是分钟单位，我们将秒转换为分钟
    const periodInMinutes = Math.max(1, Math.round(intervalInSeconds / 60)); // 确保至少为1分钟，alarms API 最小单位是分钟
    const delayInMinutes = Math.max(1, Math.round(intervalInSeconds / 60)); // 首次触发延迟

    // 注意：chrome.alarms API 的 periodInMinutes 最小值为1。如果需要更频繁的触发（例如每几秒），
    // 则不能直接依赖 periodInMinutes。一种解决方法是设置一个较短的周期（例如1分钟），
    // 然后在 alarm 监听器内部使用 setTimeout/setInterval 来实现更精确的秒级控制。
    // 或者，如果任务本身不耗时，可以设置 when 参数为 Date.now() + intervalInSeconds * 1000，并且不设置 periodInMinutes，
    // 每次任务执行完毕后重新创建下一次的 alarm。
    // 为了简单起见，并遵循计划中的“定时周期（例如，每X秒/分钟）”，我们这里假设用户可以接受分钟级的近似。
    // 如果需要秒级精确，需要调整此逻辑。
    // 暂时我们先用 periodInMinutes，如果用户设置的秒数小于60，则按1分钟处理。

    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.1, // 为了尽快触发第一次，设置为一个很小的值 (e.g., 6 seconds for 0.1 minutes)
      periodInMinutes: periodInMinutes 
    });
    logToPopup(`定时器已设置，每 ${intervalInSeconds} 秒执行一次 (近似为 ${periodInMinutes} 分钟周期)。`);
    // 获取下一次执行时间并更新popup
    chrome.alarms.get(ALARM_NAME, alarm => {
      if (alarm) {
        nextScheduledRunTime = alarm.scheduledTime;
        updatePopupStatus();
      }
    });
  });
}

/**
 * @description 停止定时器函数
 * @returns {void} 无返回值
 */
function stopAlarm() {
  // 使用 chrome.alarms.clear 清除定时器
  chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
    if (wasCleared) {
      logToPopup('定时器已停止。');
    } else {
      logToPopup('没有活动的定时器需要停止。');
    }
    nextScheduledRunTime = null; // 清除下次运行时间
    updatePopupStatus(); // 更新popup状态
  });
}

// 定时器触发时的监听器
chrome.alarms.onAlarm.addListener((alarm) => {
  // 检查是否是我们设置的定时器
  if (alarm.name === ALARM_NAME) {
    logToPopup('定时任务触发。');
    // 执行核心任务
    performScheduledTask();
    // 更新下一次执行时间
    chrome.alarms.get(ALARM_NAME, currentAlarm => {
      if (currentAlarm) {
        nextScheduledRunTime = currentAlarm.scheduledTime;
        updatePopupStatus();
      }
    });
  }
});

/**
 * @description 执行预定任务的函数，主要负责点击按钮和处理网络请求
 * @returns {Promise<void>} Promise对象
 */
async function performScheduledTask() {
  // 检查任务是否仍在运行且配置有效
  if (!isRunning || !currentConfig || !currentConfig.buttonSelector) {
    logToPopup('任务未运行或配置不完整，跳过执行。');
    return; // 如果任务已停止或配置不完整，则不执行
  }

  // 1. 指令内容脚本点击按钮
  // 获取当前活动的标签页
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      // 检查目标URL配置，如果配置了，则先尝试导航
      if (currentConfig.targetUrl) {
        // 检查当前tab的URL是否与目标URL匹配 (简单匹配，可改进)
        if (!activeTab.url || !activeTab.url.startsWith(currentConfig.targetUrl.split('//')[0] + '//' + currentConfig.targetUrl.split('//')[1].split('/')[0])) {
            logToPopup(`当前标签页 (${activeTab.url}) 与目标URL (${currentConfig.targetUrl}) 不符，尝试导航...`);
            try {
                await chrome.tabs.update(activeTab.id, { url: currentConfig.targetUrl });
                // 等待页面加载完成，这里用一个简单的延时，实际应用可能需要更复杂的判断
                await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒
                logToPopup(`已导航到 ${currentConfig.targetUrl}`);
            } catch (navError) {
                logToPopup(`导航到 ${currentConfig.targetUrl} 失败: ${navError.message}`);
                return; // 导航失败则不继续
            }
        }
      }
      // 重新获取一次 activeTab，因为导航后 tab 对象可能变化
      const [currentActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentActiveTab && currentActiveTab.id) {
        logToPopup(`向内容脚本发送点击指令: ${currentConfig.buttonSelector}`);
        // 向内容脚本发送消息，要求点击按钮
        chrome.tabs.sendMessage(currentActiveTab.id, {
          command: 'clickButton',
          selector: currentConfig.buttonSelector
        }, (response) => {
          if (chrome.runtime.lastError) {
            logToPopup(`发送点击指令失败: ${chrome.runtime.lastError.message}. 确保内容脚本已注入且页面匹配。`);
          } else if (response) {
            if (response.success) {
              logToPopup(`按钮 '${currentConfig.buttonSelector}' 点击成功 (来自内容脚本)。`);
            } else {
              logToPopup(`错误: 点击按钮 '${currentConfig.buttonSelector}' 失败: ${response.error} (来自内容脚本)。`);
            }
          }
        });
      } else {
        logToPopup('无法获取活动标签页ID来发送点击指令。');
      }
    } else {
      logToPopup('没有活动的标签页来执行点击操作。');
    }
  } catch (error) {
    logToPopup(`执行预定任务时出错: ${error.message}`);
  }
  // 网络请求监听是持续的，不需要在这里特别触发
}

// 网络请求监听设置
// 注意: Manifest V3 中 webRequest 的拦截能力受限，特别是修改/阻塞请求。
// 获取响应体需要使用 chrome.debugger API，这更复杂且有安全提示。
// 为了简化，我们首先尝试使用 webRequest.onCompleted 监听完成的请求，这通常可以获取到URL和状态码。
// 如果确实需要响应体，后续再考虑集成 chrome.debugger。

// 移除旧的监听器（如果存在），以防重复添加
if (chrome.webRequest.onCompleted.hasListener(networkRequestListener)) {
  chrome.webRequest.onCompleted.removeListener(networkRequestListener);
}

/**
 * @description 网络请求监听函数，用于监听匹配的URL请求
 * @param {Object} details - 请求详情对象
 * @returns {void} 无返回值
 */
function networkRequestListener(details) {
  // 检查任务是否正在运行以及是否有监听URL的配置
  if (!isRunning || !currentConfig.listenUrl || !currentConfig.submitUrl) {
    return; // 如果未运行或配置不完整，则不处理
  }

  // 使用通配符匹配URL (简单实现，可以使用更复杂的匹配库)
  const pattern = new RegExp(currentConfig.listenUrl.replace(/\*/g, '.*'));
  if (pattern.test(details.url)) {
    logToPopup(`监听到匹配的URL完成请求: ${details.url} (状态码: ${details.statusCode})`);

    // 此时我们有 details.url, details.method, details.statusCode 等信息。
    // 获取响应体 (Response Body) 在 Manifest V3 的 chrome.webRequest 中是受限的。
    // 通常需要 chrome.debugger API 才能可靠获取。
    // 这里我们暂时只记录URL被访问，并模拟一个数据对象。
    // TODO: 实现真正的响应体捕获 (可能需要 debugger API)

    let responseData = {
      url: details.url,
      method: details.method,
      statusCode: details.statusCode,
      timestamp: new Date().toISOString(),
      message: '响应体数据占位符 - 实际数据需通过debugger API获取'
    };

    // 2. 数据整理
    processData(responseData).then(processedData => {
      // 3. 数据提交
      submitData(processedData);
    }).catch(error => {
      logToPopup(`数据整理失败: ${error.message}`);
    });
  }
}

// 添加网络请求监听器
chrome.webRequest.onCompleted.addListener(
  networkRequestListener,
  { urls: ['<all_urls>'] } // 监听所有URL，然后在回调中根据用户配置过滤
);

/**
 * @description 数据整理引擎函数，根据配置的处理方法对数据进行整理
 * @param {Object} data - 原始数据
 * @returns {Promise<Object>} 处理后的数据
 */
async function processData(data) {
  logToPopup('开始整理数据...');
  // 检查是否有整理方法配置
  if (currentConfig.dataProcessingMethod === 'none' || !currentConfig.dataProcessingMethod) {
    logToPopup('数据整理方法：无。');
    return data; // 如果没有选择整理方法，直接返回原始数据
  }

  if (currentConfig.dataProcessingMethod === 'extractJsonField') {
    // 预设逻辑：提取特定JSON字段 (示例：假设我们要提取 'payload.value')
    // 实际应用中，这个字段名应该由用户配置
    try {
      // 假设原始数据是JSON字符串，或者其一部分是JSON
      // 这里需要一个健壮的方式来确定哪个部分是JSON以及如何解析
      // 为了演示，我们假设data本身或其某个属性是目标JSON
      let jsonData = data; // 或者 data.somePropertyIfApplicable
      // 尝试解析，如果data本身不是JSON字符串，这一步会失败
      if (typeof data === 'string') {
         try { jsonData = JSON.parse(data); } catch (e) { /* 忽略解析错误，可能不是JSON字符串 */ }
      }
      // 假设用户想提取 'message' 字段 (这应该来自用户配置)
      const fieldToExtract = 'message'; // 示例字段，应来自用户配置
      if (jsonData && typeof jsonData === 'object' && jsonData.hasOwnProperty(fieldToExtract)) {
        logToPopup(`数据整理：提取字段 '${fieldToExtract}'。`);
        return { extractedValue: jsonData[fieldToExtract] };
      } else {
        logToPopup(`数据整理：无法在数据中找到字段 '${fieldToExtract}'。`);
        return { originalData: data, error: `Field ${fieldToExtract} not found` };
      }
    } catch (e) {
      logToPopup(`数据整理 (extractJsonField) 失败: ${e.message}`);
      return { originalData: data, error: e.message };
    }
  }

  if (currentConfig.dataProcessingMethod === 'customScript') {
    // 高级逻辑：执行用户提供的JavaScript代码
    if (currentConfig.customScript) {
      logToPopup('数据整理：执行自定义脚本。');
      try {
        // 注意：直接使用 Function 构造器或 eval 执行用户脚本存在安全风险。
        // Manifest V3 推荐在沙箱环境 (如 iframe) 中执行不受信任的代码。
        // 或者使用更安全的解析和执行机制。
        // 为了演示，这里使用 Function 构造器，但生产环境需要更安全的方案。
        const processFunction = new Function('responseData', currentConfig.customScript);
        const processed = await processFunction(data);
        logToPopup('自定义脚本执行完毕。');
        return processed;
      } catch (e) {
        logToPopup(`自定义脚本执行错误: ${e.message}`);
        return { originalData: data, error: `Custom script error: ${e.message}` };
      }
    } else {
      logToPopup('数据整理：自定义脚本为空。');
      return data;
    }
  }
  // 如果没有匹配的处理方法
  return data;
}

/**
 * @description 数据提交模块函数，将处理后的数据提交到指定URL
 * @param {Object} dataToSubmit - 要提交的数据
 * @returns {Promise<void>} Promise对象
 */
async function submitData(dataToSubmit) {
  // 检查是否有提交URL的配置
  if (!currentConfig.submitUrl) {
    logToPopup('数据提交URL未配置，跳过提交。');
    return; // 如果没有提交URL，则不执行
  }
  logToPopup(`准备提交数据到: ${currentConfig.submitUrl}`);
  try {
    // 使用 fetch API 发送 POST 请求
    const response = await fetch(currentConfig.submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dataToSubmit)
    });

    // 检查响应状态
    if (response.ok) {
      const responseData = await response.text(); // 或 response.json() 如果服务器返回JSON
      logToPopup(`数据成功提交到 ${currentConfig.submitUrl}。服务器响应: ${responseData.substring(0,100)}...`);
    } else {
      logToPopup(`数据提交失败。服务器返回状态: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logToPopup(`数据提交过程中发生网络错误: ${error.message}`);
  }
}

/**
 * @description 更新 Popup 显示的状态信息
 * @param {Function} [callback] - 可选的回调函数
 * @returns {void} 无返回值
 */
function updatePopupStatus(callback) {
  // 构造状态信息对象
  const statusInfo = {
    command: 'updateStatus',
    isRunning: isRunning,
    status: isRunning ? (nextScheduledRunTime ? '运行中' : '启动中...') : '未运行',
    nextRunTime: nextScheduledRunTime
  };
  // 向 popup 发送消息
  chrome.runtime.sendMessage(statusInfo).catch(error => {
    // 如果popup未打开，sendMessage会失败，这是正常的，可以忽略这个错误
    // console.log('Popup未打开，无法更新状态:', error.message);
  });
  // 如果提供了回调函数 (例如来自 getStatus 请求)，则调用它
  if (typeof callback === 'function') {
    callback(statusInfo);
  }
}

/**
 * @description 向Popup发送日志消息
 * @param {string} messageContent - 日志消息内容
 * @returns {void} 无返回值
 */
function logToPopup(messageContent) {
  // 构造日志消息对象
  const logMessage = {
    command: 'log',
    message: messageContent
  };
  // 向 popup 发送消息
  chrome.runtime.sendMessage(logMessage).catch(error => {
    // console.log('Popup未打开，无法发送日志:', error.message);
  });
  // 同时也在后台控制台打印一份日志，方便调试
  console.log(`[Background Log] ${new Date().toLocaleTimeString()}: ${messageContent}`);
}

// 扩展安装或更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
  // details.reason can be 'install', 'update', or 'chrome_update'
  if (details.reason === 'install') {
    logToPopup('扩展已安装。请在Popup中配置并启动。');
    // 初始化默认配置（如果需要）
    chrome.storage.local.set({
        isRunning: false,
        timerInterval: 60, // 默认60秒
        dataProcessingMethod: 'none'
    });
  } else if (details.reason === 'update') {
    logToPopup('扩展已更新。');
  }
  // 检查并恢复运行状态 (例如浏览器重启后)
  chrome.storage.local.get(['isRunning', 'currentConfig'], (result) => {
    if (result.isRunning && result.currentConfig) {
      currentConfig = result.currentConfig;
      isRunning = true;
      // 如果之前是运行状态，重新创建定时器
      // 但要注意，如果浏览器关闭时 alarm 还在，重启后 alarm 可能会自动恢复。
      // 这里我们先尝试获取已有的 alarm，如果没有，再创建。
      chrome.alarms.get(ALARM_NAME, (existingAlarm) => {
        if (existingAlarm) {
          logToPopup('检测到已存在的定时器，恢复运行状态。');
          nextScheduledRunTime = existingAlarm.scheduledTime;
        } else {
          logToPopup('恢复运行状态，重新创建定时器。');
          createAlarm(currentConfig.timerInterval);
        }
        updatePopupStatus();
      });
    } else {
        isRunning = false;
        chrome.storage.local.set({ isRunning: false }); // 确保状态一致
    }
  });
});

// 浏览器启动时，也检查一次状态
chrome.runtime.onStartup.addListener(() => {
    logToPopup('浏览器启动。');
    chrome.storage.local.get(['isRunning', 'currentConfig'], (result) => {
        if (result.isRunning && result.currentConfig) {
            currentConfig = result.currentConfig;
            isRunning = true;
            chrome.alarms.get(ALARM_NAME, (existingAlarm) => {
                if (existingAlarm) {
                    logToPopup('检测到已存在的定时器，恢复运行状态 (onStartup)。');
                    nextScheduledRunTime = existingAlarm.scheduledTime;
                } else {
                    logToPopup('恢复运行状态，重新创建定时器 (onStartup)。');
                    createAlarm(currentConfig.timerInterval);
                }
                updatePopupStatus();
            });
        } else {
            isRunning = false;
            chrome.storage.local.set({ isRunning: false });
        }
    });
});

logToPopup('后台脚本 (Service Worker) 已启动。');

