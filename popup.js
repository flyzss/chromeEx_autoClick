// popup.js
// Handles user interactions in popup.html, including consent, configuration, and communication with background.js.

document.addEventListener('DOMContentLoaded', function () {
    // Consent-related DOM elements
    const consentArea = document.getElementById('consentArea');
    const mainApp = document.getElementById('mainApp');
    const consentCheckbox = document.getElementById('consentCheckbox');
    const confirmConsentButton = document.getElementById('confirmConsentButton');
    const readDisclaimerLink = document.getElementById('readDisclaimerLink');
    const consentError = document.getElementById('consentError');
    const disclaimerTitle = document.getElementById('disclaimerTitle'); // For scrolling

    // Main application DOM elements (to be initialized after consent)
    let targetUrlInput, buttonSelectorInput, listenUrlInput, submitUrlInput,
        timerIntervalInput, dataProcessingMethodSelect, customScriptContainer,
        customScriptInput, startButton, stopButton, statusDisplay,
        nextRunDisplay, logDisplay, logsContainer;

    /**
 * @description 初始化主应用程序的DOM元素
 * @returns {void} 无返回值
 */
function initializeMainAppDOMElements() {
        targetUrlInput = document.getElementById('targetUrl');
        buttonSelectorInput = document.getElementById('buttonSelector');
        listenUrlInput = document.getElementById('listenUrl');
        submitUrlInput = document.getElementById('submitUrl');
        timerIntervalInput = document.getElementById('timerInterval');
        dataProcessingMethodSelect = document.getElementById('dataProcessingMethod');
        customScriptContainer = document.getElementById('customScriptContainer');
        customScriptInput = document.getElementById('customScript');
        startButton = document.getElementById('startButton');
        stopButton = document.getElementById('stopButton');
        statusDisplay = document.getElementById('statusDisplay');
        nextRunDisplay = document.getElementById('nextRunDisplay');
        logDisplay = document.getElementById('logDisplay');
        logsContainer = document.querySelector('#mainApp .logs'); // More specific selector
    }

    /**
 * @description 显示主应用程序界面，隐藏同意区域
 * @returns {void} 无返回值
 */
function showMainApp() {
        if (consentArea) consentArea.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        initializeMainAppDOMElements();
        initializeAppLogic();
    }

    /**
 * @description 显示同意区域，隐藏主应用程序
 * @returns {void} 无返回值
 */
function showConsentArea() {
        if (consentArea) consentArea.style.display = 'block';
        if (mainApp) mainApp.style.display = 'none';
    }

    // Check consent status on load
    chrome.storage.local.get(['disclaimerAgreedTimestamp'], function (result) {
        if (result.disclaimerAgreedTimestamp) {
            showMainApp();
        } else {
            showConsentArea();
        }
    });

    // Event listener for "Read Disclaimer" link
    if (readDisclaimerLink && disclaimerTitle) {
        readDisclaimerLink.addEventListener('click', function (event) {
            event.preventDefault();
            disclaimerTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Event listener for consent checkbox
    if (consentCheckbox && confirmConsentButton) {
        consentCheckbox.addEventListener('change', function () {
            confirmConsentButton.disabled = !this.checked;
            if (this.checked && consentError) {
                consentError.style.display = 'none';
            }
        });
    }

    // Event listener for confirm consent button
    if (confirmConsentButton && consentCheckbox) {
        confirmConsentButton.addEventListener('click', function () {
            if (consentCheckbox.checked) {
                const timestamp = new Date().toISOString();
                chrome.storage.local.set({ disclaimerAgreedTimestamp: timestamp }, function () {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving consent:', chrome.runtime.lastError);
                        if (consentError) {
                            consentError.textContent = '同意状态保存失败，请刷新重试。';
                            consentError.style.display = 'block';
                        }
                        return;
                    }
                    console.log('Disclaimer agreed at:', timestamp);
                    showMainApp();
                });
            } else {
                if (consentError) consentError.style.display = 'block';
            }
        });
    }

    // Main application logic (to be initialized after consent)
    /**
 * @description 初始化应用程序逻辑，包括事件监听器和配置加载
 * @returns {void} 无返回值
 */
function initializeAppLogic() {
        if (!targetUrlInput) { // Guard against uninitialized DOM
            console.error("Main app DOM elements not found. Cannot initialize app logic.");
            return;
        }

        if (dataProcessingMethodSelect && customScriptContainer) {
            dataProcessingMethodSelect.addEventListener('change', function () {
                customScriptContainer.style.display = (this.value === 'customScript') ? 'block' : 'none';
            });
        }

        if (startButton) {
            startButton.addEventListener('click', function () {
                const currentConfig = saveConfig();
                if (!currentConfig) return; // saveConfig might return null if DOM not ready

                if (!currentConfig.buttonSelector || !currentConfig.listenUrl || !currentConfig.submitUrl) {
                    updateLog('错误: 按钮选择器, 监听URL, 和提交URL 不能为空。');
                    if (logsContainer) logsContainer.style.display = 'block';
                    return;
                }
                chrome.runtime.sendMessage({ command: 'start', config: currentConfig }, function(response) {
                    if (response && response.status === 'started') {
                        updateUiForRunningState(true);
                        if (statusDisplay) statusDisplay.textContent = '启动中...';
                        updateLog('任务已启动。');
                    } else if (response && response.error) {
                        updateLog(`启动失败: ${response.error}`);
                    } else {
                        updateLog('启动请求发送失败或未收到响应。');
                    }
                });
            });
        }

        if (stopButton) {
            stopButton.addEventListener('click', function () {
                chrome.runtime.sendMessage({ command: 'stop' }, function(response) {
                    if (response && response.status === 'stopped') {
                        updateUiForRunningState(false);
                        updateLog('任务已停止。');
                    } else if (response && response.error) {
                        updateLog(`停止失败: ${response.error}`);
                    } else {
                        updateLog('停止请求发送失败或未收到响应。');
                    }
                });
            });
        }

        loadConfig(); // Load existing config into the form
        chrome.runtime.sendMessage({ command: 'getStatus' }); // Get current status from background
        window.addEventListener('unload', saveConfig); // Save config when popup closes
    }

    /**
 * @description 从Chrome存储中加载配置到表单
 * @returns {void} 无返回值
 */
function loadConfig() {
        if (!targetUrlInput) return; // Ensure DOM is ready

        chrome.storage.local.get([
            'targetUrl', 'buttonSelector', 'listenUrl', 'submitUrl',
            'timerInterval', 'dataProcessingMethod', 'customScript', 'isRunning'
        ], function (result) {
            if (chrome.runtime.lastError) {
                console.error("Error loading config:", chrome.runtime.lastError);
                return;
            }
            if (result.targetUrl) targetUrlInput.value = result.targetUrl;
            if (result.buttonSelector) buttonSelectorInput.value = result.buttonSelector;
            if (result.listenUrl) listenUrlInput.value = result.listenUrl;
            if (result.submitUrl) submitUrlInput.value = result.submitUrl;
            if (result.timerInterval) timerIntervalInput.value = result.timerInterval;
            if (result.dataProcessingMethod && dataProcessingMethodSelect && customScriptContainer) {
                dataProcessingMethodSelect.value = result.dataProcessingMethod;
                customScriptContainer.style.display = (result.dataProcessingMethod === 'customScript') ? 'block' : 'none';
            } else if (customScriptContainer) {
                customScriptContainer.style.display = 'none'; // Default to hidden
            }
            if (result.customScript && customScriptInput) customScriptInput.value = result.customScript;

            updateUiForRunningState(result.isRunning || false);
            if (result.isRunning) {
                chrome.runtime.sendMessage({ command: 'getStatus' });
            }
        });
    }

    /**
 * @description 将当前表单配置保存到Chrome存储
 * @returns {Object|null} 成功时返回当前配置对象，DOM元素未准备好时返回null
 */
function saveConfig() {
        if (!targetUrlInput) { // Ensure DOM is ready before trying to save
            // console.warn("Attempted to save config before main app DOM was ready.");
            return null;
        }
        const config = {
            targetUrl: targetUrlInput.value.trim(),
            buttonSelector: buttonSelectorInput.value.trim(),
            listenUrl: listenUrlInput.value.trim(),
            submitUrl: submitUrlInput.value.trim(),
            timerInterval: parseInt(timerIntervalInput.value, 10) || 60, // Default to 60 if parsing fails
            dataProcessingMethod: dataProcessingMethodSelect ? dataProcessingMethodSelect.value : 'firstLine',
            customScript: customScriptInput ? customScriptInput.value.trim() : ''
        };
        chrome.storage.local.set(config, function () {
            if (chrome.runtime.lastError) {
                // console.error("Error saving config:", chrome.runtime.lastError);
            }
        });
        return config;
    }

    /**
 * @description 更新UI以反映任务的运行状态
 * @param {boolean} running - 任务是否正在运行
 * @returns {void} 无返回值
 */
function updateUiForRunningState(running) {
        if (!startButton || !stopButton || !statusDisplay || !nextRunDisplay) return; // Ensure DOM is ready

        startButton.disabled = running;
        stopButton.disabled = !running;

        const formElements = [targetUrlInput, buttonSelectorInput, listenUrlInput, submitUrlInput, timerIntervalInput, dataProcessingMethodSelect, customScriptInput];
        formElements.forEach(el => {
            if (el) el.disabled = running;
        });

        statusDisplay.textContent = running ? '运行中' : '未运行';
        if (!running) {
            nextRunDisplay.textContent = 'N/A';
        }
    }

    /**
 * @description 更新日志显示
 * @param {string} logMessage - 要显示的日志消息
 * @returns {void} 无返回值
 */
function updateLog(logMessage) {
        if (!logDisplay || !logsContainer) return; // Ensure DOM is ready

        const timestamp = new Date().toLocaleTimeString();
        logDisplay.textContent = `[${timestamp}] ${logMessage}\n` + logDisplay.textContent;
        if (logsContainer.style.display === 'none' || !logsContainer.style.display) {
            logsContainer.style.display = 'block';
        }
    }

    /**
     * @description 监听来自background.js的消息
     * @param {Object} message - 消息对象
     * @param {Object} sender - 发送方信息
     * @param {Function} sendResponse - 回调函数
     */
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (message.command === 'updateStatus') {
            if (statusDisplay && nextRunDisplay && typeof updateUiForRunningState === 'function') {
                statusDisplay.textContent = message.status || (message.isRunning ? '运行中' : '未运行');
                nextRunDisplay.textContent = message.nextRunTime ? new Date(message.nextRunTime).toLocaleString() : 'N/A';
                updateUiForRunningState(message.isRunning || false);
            }
        } else if (message.command === 'log') {
            if (typeof updateLog === 'function') {
                updateLog(message.message);
            }
        }
    });
});
