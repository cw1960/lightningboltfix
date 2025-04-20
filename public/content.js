// Content script for Lightning Bolt Fix extension

console.log("LBF Content Script Loaded");

let isPickerActive = false;
let highlightOverlay = null; // Reference to the overlay element
let currentTargetElement = null; // Keep track of the currently hovered element

const HIGHLIGHT_STYLE = `
  position: fixed;
  z-index: 99999;
  background-color: rgba(0, 136, 255, 0.3); /* Semi-transparent blue */
  border: 1px solid rgba(0, 136, 255, 0.8);
  border-radius: 3px;
  pointer-events: none; /* Allow clicks to pass through */
  transition: all 0.05s ease; /* Smooth movement */
  display: none; /* Hidden initially */
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
  // Only hide if moving outside the current target or to the overlay itself
  if (highlightOverlay && (event.relatedTarget !== currentTargetElement || event.relatedTarget === highlightOverlay)) {
      highlightOverlay.style.display = 'none';
      currentTargetElement = null;
  }
};

const handleClick = (event) => {
  if (!isPickerActive) return;
  console.log('LBF: Click intercepted:', event.target);
  event.preventDefault();
  event.stopPropagation();
  
  const clickedElement = event.target;
  const text = clickedElement.textContent?.trim() || '';
  console.log("LBF: Captured text:", text);
  
  // Send message back to side panel
  chrome.runtime.sendMessage({ type: 'ELEMENT_PICKED', payload: text }, (response) => {
      if (chrome.runtime.lastError) {
          console.error("LBF: Error sending ELEMENT_PICKED message:", chrome.runtime.lastError);
      } else {
          console.log("LBF: ELEMENT_PICKED message sent successfully. Response:", response);
      }
  });

  deactivatePickerMode(); 
};

function activatePickerMode() {
  if (isPickerActive) return;
  console.log("LBF: Activating picker mode...");
  isPickerActive = true;

  // Create and append highlightOverlay element if it doesn't exist
  if (!highlightOverlay) {
    highlightOverlay = document.createElement('div');
    highlightOverlay.style.cssText = HIGHLIGHT_STYLE;
    document.body.appendChild(highlightOverlay);
  } else {
    // Ensure it's visible if re-activating
    highlightOverlay.style.display = 'none'; 
  }

  // Add temporary listeners
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('click', handleClick, { capture: true });
}

function deactivatePickerMode() {
  if (!isPickerActive) return;
  console.log("LBF: Deactivating picker mode...");

  // Remove listeners
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
  document.removeEventListener('click', handleClick, { capture: true });

  // Remove highlightOverlay element
  if (highlightOverlay) {
    highlightOverlay.style.display = 'none'; // Hide it immediately
    // Optional: Could remove from DOM completely: highlightOverlay.remove(); 
    // Keeping it might be slightly more performant if frequently used.
  }

  currentTargetElement = null;
  isPickerActive = false;
}

// Listener for messages from the Side Panel (MainApp)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("LBF Content Script received message:", message);
  if (message.type === 'START_ELEMENT_PICKING') {
    activatePickerMode();
    // Optional: sendResponse({success: true}) if needed
  }
  // Add other message types later if needed (e.g., CANCEL_PICKING)
  
  // Return true if you intend to send response asynchronously, otherwise omit or return false.
  // For now, we don't need async responses here.
  // return true; 
});

// NOTE: The MutationObserver below is currently configured to look for 
// conversational 'Potential problems detected.' messages.

function checkForProblemDetection(node) {
  // Check if the node itself is the target h4
  if (node.matches && node.matches('h4') && node.textContent?.includes('Potential problems detected.')) {
    console.log("LBF: 'Potential problems detected.' found directly in node:", node);
    // We won't send a message yet, just log for verification
    return true; // Found
  }

  // Check if any descendant is the target h4
  if (node.querySelector) {
    // Use querySelector to find the first matching h4 descendant
    const problemH4 = node.querySelector('h4'); 
    // Further check if this specific h4 contains the text
    if (problemH4 && problemH4.textContent?.includes('Potential problems detected.')) {
      console.log("LBF: 'Potential problems detected.' found in descendant H4:", problemH4);
      // We won't send a message yet, just log for verification
      return true; // Found
    }
  }

  return false; // Not found
}

// Use a MutationObserver to watch for changes in the DOM
const observer = new MutationObserver((mutationsList) => {
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        // Check the added node and its descendants
        if (node.nodeType === Node.ELEMENT_NODE && checkForProblemDetection(node)) {
           console.log("LBF: 'Potential problems detected.' processed by observer.");
        }
      });
    }
  }
});

// Start observing the body for added nodes
observer.observe(document.body, { childList: true, subtree: true });
console.log("LBF: MutationObserver started on document body (looking for problems detected text).");
