// Content script for Lightning Bolt Fix extension

console.log("LBF Content Script Loaded");

// --- Element Picker Logic --- 

let isPickerActive = false;
let currentPickerType = null; // 'element' or 'code'
let highlightOverlay = null; 
let currentTargetElement = null; 

const HIGHLIGHT_STYLE = `
  position: fixed;
  z-index: 99999;
  background-color: rgba(0, 136, 255, 0.3);
  border: 1px solid rgba(0, 136, 255, 0.8);
  border-radius: 3px;
  pointer-events: none; 
  transition: all 0.05s ease; 
  display: none; 
`;

const handleMouseOver = (event) => {
  currentTargetElement = event.target;
  if (highlightOverlay && currentTargetElement) {
    const rect = currentTargetElement.getBoundingClientRect();
    highlightOverlay.style.top = `${rect.top}px`;
    highlightOverlay.style.left = `${rect.left}px`;
    highlightOverlay.style.width = `${rect.width}px`;
    highlightOverlay.style.height = `${rect.height}px`;
    highlightOverlay.style.display = 'block';
  }
};

const handleMouseOut = (event) => {
  if (highlightOverlay && (event.relatedTarget !== currentTargetElement || event.relatedTarget === highlightOverlay)) {
      highlightOverlay.style.display = 'none';
      currentTargetElement = null;
  }
};

function activatePickerMode(pickerType) { 
  if (isPickerActive) return; 
  console.log(`LBF: Activating picker mode for ${pickerType}...`);
  isPickerActive = true;
  currentPickerType = pickerType; 

  // Create/show highlight overlay
  if (!highlightOverlay) {
    highlightOverlay = document.createElement('div');
    highlightOverlay.style.cssText = HIGHLIGHT_STYLE;
    document.body.appendChild(highlightOverlay);
  } else {
    highlightOverlay.style.display = 'none'; 
  }

  // Add mouse listeners
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  console.log("LBF: Mouse listeners added for picker mode."); 
}

function deactivatePickerMode() {
  console.log("LBF: deactivatePickerMode called."); 
  if (!isPickerActive) return; 
  console.log("LBF: Deactivating picker mode...");

  // Remove mouse listeners
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);

  // Hide/remove highlightOverlay
  if (highlightOverlay) {
    highlightOverlay.style.display = 'none'; 
  }

  currentTargetElement = null;
  isPickerActive = false;
  currentPickerType = null; 
}

// Listener for messages from the Side Panel (MainApp)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("LBF Content Script received message:", message);
  
  if (message.type === 'START_ELEMENT_PICKING') {
    activatePickerMode('element');
    document.addEventListener('click', handleElementClick, { capture: true, once: true }); 
    return false; 
  } 
  
  return false; 
});

// --- Signal Readiness --- 
// Send a message to the background script indicating the content script is ready to receive messages
console.log("LBF: Content script attempting to signal readiness to background.");
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }, (response) => {
    if (chrome.runtime.lastError) {
        console.error("LBF: Error signaling readiness:", chrome.runtime.lastError.message || chrome.runtime.lastError);
    } else {
        console.log("LBF: Successfully signaled readiness to background. Response:", response);
    }
});

// Click handler specifically for ELEMENT picking
const handleElementClick = (event) => {
   if (!isPickerActive || currentPickerType !== 'element') return; 
   console.log(`LBF: Click intercepted for [${currentPickerType}]:`, event.target);
   event.preventDefault();
   event.stopPropagation();
   
   const clickedElement = event.target;
   const text = clickedElement.textContent?.trim() || ''; 
   console.log("LBF: Captured element text (textContent):", text);
   
   const messageType = 'ELEMENT_PICKED'; 
   
   chrome.runtime.sendMessage({ type: messageType, payload: text }, (response) => {
       if (chrome.runtime.lastError) {
           console.error(`LBF: Error sending ${messageType} message:`, chrome.runtime.lastError.message || chrome.runtime.lastError);
       } else {
           console.log(`LBF: ${messageType} message sent successfully. Response:`, response);
       }
   });

   deactivatePickerMode(); 
};

// --- Mutation Observer (for potential future automatic error detection) ---

// NOTE: This observer is currently configured to look for conversational 
// 'Potential problems detected.' messages (h4 tag). 
// It's not actively used by the element picker but kept for potential future use.

function checkForProblemDetection(node) {
  // Check if the node itself is the target h4
  if (node.matches && node.matches('h4') && node.textContent?.includes('Potential problems detected.')) {
    console.log("LBF: (Observer) 'Potential problems detected.' found directly in node:", node);
  return true;
}

  // Check if any descendant is the target h4
  if (node.querySelector) {
    const problemH4 = node.querySelector('h4'); 
    if (problemH4 && problemH4.textContent?.includes('Potential problems detected.')) {
      console.log("LBF: (Observer) 'Potential problems detected.' found in descendant H4:", problemH4);
      return true; 
    }
  }
  return false; 
}

const observer = new MutationObserver((mutationsList) => {
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && checkForProblemDetection(node)) {
           console.log("LBF: (Observer) 'Potential problems detected.' processed by observer.");
        }
      });
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
console.log("LBF: MutationObserver started on document body (looking for problems detected text).");
