#!/bin/bash

# Create necessary directories
mkdir -p dist/icons

# Create background.js
cat > dist/background.js << 'EOF'
// Background script for Lightning Bolt Fix V3 extension

// Listen for messages from the content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message);

  if (message.action === 'captureScreenshot') {
    captureScreenshot(sender.tab.id)
      .then(dataUrl => {
        sendResponse({ success: true, screenshot: dataUrl });
      })
      .catch(error => {
        console.error('Error capturing screenshot:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates we will send a response asynchronously
  }

  if (message.action === 'fixCode') {
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
  }
});

// Function to capture a screenshot of the current tab
async function captureScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, dataUrl => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

// Function to call Claude API
async function callClaudeAPI(errorMessage, code, screenshot, apiKey) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `I'm getting the following error in my code:
${errorMessage}

Here's the code that's causing the error:
${code}

Please fix the code and explain what was wrong. Provide the corrected code in a code block.`
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Claude API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

// Function to call Gemini API
async function callGeminiAPI(errorMessage, code, screenshot, apiKey) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `I'm getting the following error in my code:
${errorMessage}

Here's the code that's causing the error:
${code}

Please fix the code and explain what was wrong. Provide the corrected code in a code block.`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4000
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.url.startsWith('https://bolt.new')) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});
EOF

# Create content.js
cat > dist/content.js << 'EOF'
// Content script for Lightning Bolt Fix V3 extension

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  if (message.action === 'getErrorInfo') {
    const errorInfo = extractErrorInfo();
    sendResponse({ success: true, errorInfo });
  }

  if (message.action === 'getSelectedCode') {
    const selectedCode = getSelectedText();
    sendResponse({ success: true, selectedCode });
  }

  if (message.action === 'applyFix') {
    const { fixedCode } = message;
    const success = applyFixToEditor(fixedCode);
    sendResponse({ success });
  }
});

// Function to extract error information from the page
function extractErrorInfo() {
  // This is a placeholder implementation
  // The actual implementation would need to find error messages in the Bolt.new UI
  const errorElements = document.querySelectorAll('.error-message, .error-container');
  
  if (errorElements.length > 0) {
    return {
      message: errorElements[0].textContent.trim(),
      location: errorElements[0].getAttribute('data-location') || ''
    };
  }
  
  return { message: '', location: '' };
}

// Function to get selected text from the editor
function getSelectedText() {
  // This is a placeholder implementation
  // The actual implementation would need to interact with the Bolt.new editor
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) {
    return selection.toString();
  }
  
  // Try to find the editor element and get its selected text
  const editorElements = document.querySelectorAll('.monaco-editor, .editor-container');
  if (editorElements.length > 0) {
    // This is a simplified approach - actual implementation would depend on how Bolt.new's editor works
    const editorContent = editorElements[0].textContent;
    return editorContent;
  }
  
  return '';
}

// Function to apply fixed code to the editor
function applyFixToEditor(fixedCode) {
  // This is a placeholder implementation
  // The actual implementation would need to interact with the Bolt.new editor
  
  // For now, we'll just copy the fixed code to the clipboard
  navigator.clipboard.writeText(fixedCode)
    .then(() => {
      console.log('Fixed code copied to clipboard');
      
      // Show a notification to the user
      const notification = document.createElement('div');
      notification.style.position = 'fixed';
      notification.style.top = '20px';
      notification.style.right = '20px';
      notification.style.backgroundColor = '#1488fc';
      notification.style.color = 'white';
      notification.style.padding = '10px 20px';
      notification.style.borderRadius = '4px';
      notification.style.zIndex = '9999';
      notification.textContent = 'Fixed code copied to clipboard! Paste it into the editor.';
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.remove();
      }, 5000);
    })
    .catch(err => {
      console.error('Failed to copy fixed code to clipboard:', err);
      return false;
    });
  
  return true;
}
EOF

# Create manifest.json
cat > dist/manifest.json << 'EOF'
{
  "manifest_version": 3,
  "name": "Lightning Bolt Fix V3",
  "version": "3.1.1",
  "description": "Fix Bolt.new errors using external LLMs with your own API keys",
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "identity",
    "sidePanel"
  ],
  "host_permissions": [
    "https://bolt.new/*",
    "https://api.anthropic.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://myqbmklllyhjvasqstbz.supabase.co/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://bolt.new/*"],
      "js": ["content.js"]
    }
  ],
  "content_security_policy": {
    "extension_pages": "default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src https://api.anthropic.com https://generativelanguage.googleapis.com https://myqbmklllyhjvasqstbz.supabase.co 'self'"
  }
}
EOF

# Create sidepanel.html
cat > dist/sidepanel.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lightning Bolt Fix V3</title>
  <link rel="stylesheet" href="assets/index-D8b4DHJx.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="assets/index-9_sxcfan.js"></script>
</body>
</html>
EOF

# Create placeholder icon files
touch dist/icons/icon16.png dist/icons/icon48.png dist/icons/icon128.png

echo "Extension files for Lightning Bolt Fix V3 created successfully!"
