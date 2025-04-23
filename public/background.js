// Background script for Lightning Bolt Fix extension
// import ExtPay from 'extpay'; // Revert this

// --- ExtPay Initialization ---
try {
    // Use importScripts as recommended for MV3 service workers by ExtPay docs
    self.importScripts('ExtPay.js'); 
} catch (e) {
    console.error("Failed to import ExtPay.js. Ensure it's included in the build output (e.g., in the public folder).");
}
// Remove importScripts block <-- This comment is now incorrect, removed.

// Initialize ExtPay - DO THIS ONLY ONCE AT THE TOP LEVEL
let extpayInstance;
try {
    // Check if ExtPay loaded successfully via importScripts
    if (typeof ExtPay !== 'undefined') { 
        extpayInstance = ExtPay('lightning-bolt-fix'); 
        extpayInstance.startBackground(); // Required setup
        console.log("ExtPay background started.");
    } else {
        throw new Error("ExtPay function not found after importScripts.");
    }
} catch (e) {
    console.error("ExtPay initialization failed:", e);
}
// --- End ExtPay Initialization ---

console.log('Background service worker started (after ExtPay init attempt).');

// We no longer use an in-memory Set
// const readyTabs = new Set();

// Helper function to get ready tabs from storage
async function getReadyTabs() {
  try {
    const data = await chrome.storage.session.get('readyTabs');
    // Ensure we return a Set, even if nothing is in storage yet
    return new Set(data.readyTabs || []); 
  } catch (error) {
    console.error("Background: Error getting readyTabs from storage:", error);
    return new Set(); // Return empty set on error
  }
}

// Helper function to save ready tabs to storage
async function saveReadyTabs(tabsSet) {
  try {
    // Convert Set to Array for storage
    await chrome.storage.session.set({ readyTabs: Array.from(tabsSet) });
  } catch (error) {
    console.error("Background: Error saving readyTabs to storage:", error);
  }
}

// Listen for messages from the content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message, "from sender:", sender);

  if (message.type === 'CONTENT_SCRIPT_READY') {
    if (sender.tab && sender.tab.id) {
      const tabId = sender.tab.id;
      console.log(`Background: CONTENT_SCRIPT_READY received for tab ${tabId}`);
      getReadyTabs().then(currentTabs => {
        if (!currentTabs.has(tabId)) {
          currentTabs.add(tabId);
          saveReadyTabs(currentTabs).then(() => {
              console.log(`Background: Added tab ${tabId} to storage. Current ready tabs:`, Array.from(currentTabs));
              sendResponse({ status: "ok" });
          });
        } else {
          console.log(`Background: Tab ${tabId} already in ready set.`);
          sendResponse({ status: "already_ok" });
        }
      });
    } else {
       console.warn("Background: Received CONTENT_SCRIPT_READY from non-tab sender?", sender);
       sendResponse({ status: "error", reason: "No sender tab ID"});
    }
    return true; // Indicate async response needed
  } else if (message.type === 'CHECK_CONTENT_SCRIPT_READY') {
    if (message.tabId) {
      const tabIdToCheck = message.tabId;
      getReadyTabs().then(currentTabs => {
          const isReady = currentTabs.has(tabIdToCheck);
          console.log("Background: Current readyTabs Set from storage:", currentTabs);
          console.log(`Background: Checking readiness for tab ${tabIdToCheck}. Is ready: ${isReady}`);
          sendResponse({ ready: isReady });
      });
    } else {
      console.warn("Background: Received CHECK_CONTENT_SCRIPT_READY without tabId.");
      sendResponse({ ready: false, error: "No tabId provided" });
    }
    return true; // Indicate async response needed
  } else if (message.type === 'ERROR_DETECTED') {
    console.log('Forwarding ERROR_DETECTED message to runtime (side panel should pick it up).');
    // Forward the message to other listeners (like the side panel)
    chrome.runtime.sendMessage({ type: 'ERROR_DETECTED', payload: message.payload }).catch(error => {
        if (error.message.includes("Receiving end does not exist")) {
            console.warn("Background: Side panel not open or listening when forwarding ERROR_DETECTED.");
        } else {
            console.error("Background: Error forwarding ERROR_DETECTED:", error);
        }
    });
    sendResponse({ status: "forwarded" }); 
    return true; 
  }

  if (message.action === 'captureScreenshot') {
    try {
      captureScreenshot(sender.tab?.id)
        .then(dataUrl => {
          sendResponse({ success: true, screenshot: dataUrl });
        })
        .catch(error => {
          console.error('Error capturing screenshot:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates we will send a response asynchronously
    } catch (error) {
      console.error('Error in captureScreenshot handler:', error);
      sendResponse({ success: false, error: error.message });
      return false;
    }
  }

  if (message.action === 'fixCode') {
    try {
      const { errorMessage, code, screenshot, llm, apiKey } = message;
      
      if (llm === 'claude') {
        callClaudeAPI(errorMessage, code, screenshot, apiKey)
          .then(result => {
            sendResponse({ success: true, result });
          })
          .catch(error => {
            console.error('Error calling Claude API:', error);
            sendResponse({ success: false, error: error.message });
          });
      } else if (llm === 'gemini') {
        callGeminiAPI(errorMessage, code, screenshot, apiKey)
          .then(result => {
            sendResponse({ success: true, result });
          })
          .catch(error => {
            console.error('Error calling Gemini API:', error);
            sendResponse({ success: false, error: error.message });
          });
      } else {
        sendResponse({ success: false, error: 'Invalid LLM specified' });
      }
      
      return true; // Indicates we will send a response asynchronously
    } catch (error) {
      console.error('Error in fixCode handler:', error);
      sendResponse({ success: false, error: error.message });
      return false;
    }
  }
});

// Function to capture a screenshot of the current tab
async function captureScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    try {
      if (!tabId) {
        reject(new Error('No tab ID provided'));
        return;
      }
      
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, dataUrl => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Function to call Claude API
async function callClaudeAPI(errorMessage, code, screenshot, apiKey) {
  try {
    // Mock response for testing
    if (!apiKey) {
      return "Please provide a valid Claude API key in the settings.";
    }
    
    // Simplified API call for testing
    return `
## Error Analysis

The error occurs because you're trying to access a property of an undefined object.

## Fixed Code

\`\`\`javascript
function calculateTotal(items) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }
  
  return items.reduce((total, item) => {
    return total + (item.price || 0);
  }, 0);
}
\`\`\`

## Explanation

1. Added a check to ensure 'items' exists and is an array
2. Added a fallback to use 0 if item.price is undefined
3. This prevents the error when accessing properties of undefined objects
`;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

// Function to call Gemini API
async function callGeminiAPI(errorMessage, code, screenshot, apiKey) {
  try {
    // Mock response for testing
    if (!apiKey) {
      return "Please provide a valid Gemini API key in the settings.";
    }
    
    // Simplified API call for testing
    return `
## Error Analysis

The error occurs because you're trying to access a property of an undefined object.

## Fixed Code

\`\`\`javascript
function calculateTotal(items) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }
  
  return items.reduce((total, item) => {
    return total + (item.price || 0);
  }, 0);
}
\`\`\`

## Explanation

1. Added a check to ensure 'items' exists and is an array
2. Added a fallback to use 0 if item.price is undefined
3. This prevents the error when accessing properties of undefined objects
`;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  try {
    if (tab && tab.id) {
      chrome.sidePanel.open({ tabId: tab.id });
    } else {
      console.error('No valid tab to open side panel on');
    }
  } catch (error) {
    console.error('Error opening side panel:', error);
  }
});

// Clean up storage when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    getReadyTabs().then(currentTabs => {
        if (currentTabs.has(tabId)) {
            currentTabs.delete(tabId);
            saveReadyTabs(currentTabs).then(() => {
                 console.log(`Background: Removed closed tab ${tabId} from storage.`);
            });
        }
    });
});
