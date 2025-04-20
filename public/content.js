// Content script for Lightning Bolt Fix extension

console.log("LBF Content Script Loaded");

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
