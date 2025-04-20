// Background script for Lightning Bolt Fix extension

console.log('Background service worker started.');

// Listen for messages from the content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message, 'from sender:', sender);

  if (message.type === 'ERROR_DETECTED') {
    console.log('Forwarding ERROR_DETECTED message to runtime (side panel should pick it up).');
    // Forward the message to other listeners (like the side panel)
    chrome.runtime.sendMessage(message).catch(error => {
      // Catch errors, e.g., if the side panel isn't open
      if (error.message !== "Could not establish connection. Receiving end does not exist.") {
        console.error("Error forwarding message from background:", error);
      }
    });
    // Optional: send response back to content script if needed
    sendResponse({ status: "Message received by background" });
    return true; // Indicates you wish to send a response asynchronously (or just keep channel open)
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

// Send a message to force splash screen transition after a delay
setTimeout(() => {
  console.log('Sending forceSplashTransition message');
  try {
    chrome.runtime.sendMessage({ action: 'forceSplashTransition' })
      .catch(error => {
        // Ignore "Receiving end does not exist" errors
        if (!error.message.includes("Receiving end does not exist")) {
          console.error('Error sending message:', error);
        }
      });
  } catch (error) {
    // Ignore "Receiving end does not exist" errors
    if (!error.message.includes("Receiving end does not exist")) {
      console.error('Error sending message:', error);
    }
  }
}, 3000);
