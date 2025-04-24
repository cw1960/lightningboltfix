console.log("Content script loaded.");

// --- Global state for element picking ---
let isPicking = false;
let pickingMode: 'error' | 'plan' | null = null; // Track what we are picking for

// --- Function to handle element selection ---
function handleElementClick(event: MouseEvent) {
    if (!isPicking || !pickingMode) return;

    event.preventDefault();
    event.stopPropagation();

    const targetElement = event.target as HTMLElement;
    const elementText = targetElement.innerText || targetElement.textContent || '';

    console.log(`Content script: Picked element for ${pickingMode}:`, elementText);

    // Send different message based on picking mode
    const messageType = pickingMode === 'error' ? 'ELEMENT_PICKED' : 'PLAN_ELEMENT_PICKED';
    chrome.runtime.sendMessage({ type: messageType, payload: elementText });

    // Reset state and remove listener
    stopPickingMode();
}

// --- Function to start picking mode ---
function startPickingMode(mode: 'error' | 'plan') {
    if (isPicking) return; // Already picking
    console.log(`Content script: Starting ${mode} picking mode.`);
    isPicking = true;
    pickingMode = mode;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('click', handleElementClick, true); // Use capture phase
}

// --- Function to stop picking mode ---
function stopPickingMode() {
    if (!isPicking) return;
    console.log("Content script: Stopping picking mode.");
    isPicking = false;
    pickingMode = null;
    document.body.style.cursor = 'default';
    document.removeEventListener('click', handleElementClick, true);
}

// --- Message Listener from Background/Popup ---
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log("Content script received message:", message);

    if (message.type === 'CHECK_CONTENT_SCRIPT_READY') {
        console.log("Content script: Responding to readiness check.");
        sendResponse({ ready: true });
        return true; // Keep channel open for async response
    }

    // --- Element Picking Logic ---
    if (message.type === 'START_ELEMENT_PICKING') {
        console.log('Content script: Received START_ELEMENT_PICKING');
        startPickingMode('error'); // Use 'error' mode
        sendResponse({ status: "Error picking mode started" });
        return true; // Indicate async response needed
    } else if (message.type === 'START_PLAN_ELEMENT_PICKING') {
        console.log('Content script: Received START_PLAN_ELEMENT_PICKING');
        startPickingMode('plan'); // Use 'plan' mode
        sendResponse({ status: "Plan picking mode started" });
        return true;
    }
    // --- Schema Selection Logic (Not involving picker mode) ---
    else if (message.type === 'START_SCHEMA_SELECTION') {
        console.log('Content script: Received START_SCHEMA_SELECTION');
        try {
            const codeContainer = document.querySelector<HTMLElement>('.cm-content');
            if (codeContainer) {
                const schemaText = codeContainer.textContent || '';
                console.log('Content script: Found .cm-content, sending text back.');
                chrome.runtime.sendMessage({ type: 'SCHEMA_SELECTED', payload: schemaText });
                sendResponse({ status: "Schema selected successfully" });
            } else {
                console.warn('Content script: Could not find .cm-content element.');
                chrome.runtime.sendMessage({ type: 'SCHEMA_SELECTED', payload: '', error: 'Could not find code container element (.cm-content)' });
                sendResponse({ status: "Failed to find schema container" });
            }
        } catch (error) {
            console.error('Content script: Error during schema selection:', error);
            chrome.runtime.sendMessage({ type: 'SCHEMA_SELECTED', payload: '', error: 'An error occurred during schema selection.' });
            sendResponse({ status: "Error during schema selection" });
        }
        return true; // Indicate async response needed
    }

    // If message wasn't handled, indicate it.
    // Returning false or undefined closes the message channel synchronously.
    console.log("Content script: Message not handled by this listener.");
    return false;
});

// --- Initial Check-in with Background Script --- Notify background script that content script is ready ---
// Send a message to the background script to indicate readiness
// Use a timeout to ensure the background script is likely ready to listen
setTimeout(() => {
    try {
        chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("Content script: Could not send readiness message to background: ", chrome.runtime.lastError.message);
            } else {
                console.log("Content script: Sent readiness message to background.", response);
            }
        });
    } catch (e) {
        console.warn("Content script: Error sending readiness message: ", e);
    }
}, 500); // Delay slightly 