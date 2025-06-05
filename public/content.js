"use strict";
console.log("Content script loaded.");
let isPicking = false;
let pickingMode = null;
let lastHighlighted = null;
function highlightElement(el) {
    if (lastHighlighted && lastHighlighted !== el) {
        lastHighlighted.style.removeProperty('outline');
        lastHighlighted.style.removeProperty('background-color');
    }
    if (el) {
        el.style.setProperty('outline', '3px dashed #3b82f6', 'important');
        el.style.setProperty('background-color', 'rgba(255, 182, 193, 0.25)', 'important');
        lastHighlighted = el;
    }
    else {
        lastHighlighted = null;
    }
}
function handleMouseOver(event) {
    if (!isPicking)
        return;
    const el = event.target;
    highlightElement(el);
}
function handleMouseOut(event) {
    if (!isPicking)
        return;
    const el = event.target;
    if (el === lastHighlighted) {
        highlightElement(null);
    }
}
function handleElementClick(event) {
    if (!isPicking || !pickingMode)
        return;
    event.preventDefault();
    event.stopPropagation();
    const targetElement = event.target;
    const elementText = targetElement.innerText || targetElement.textContent || '';
    console.log(`Content script: Picked element for ${pickingMode}:`, elementText);
    const messageType = pickingMode === 'error' ? 'ELEMENT_PICKED' : 'PLAN_ELEMENT_PICKED';
    chrome.runtime.sendMessage({ type: messageType, payload: elementText });
    stopPickingMode();
}
function startPickingMode(mode) {
    if (isPicking)
        return;
    console.log(`Content script: Starting ${mode} picking mode.`);
    isPicking = true;
    pickingMode = mode;
    document.body.style.setProperty('cursor', 'pointer', 'important');
    document.addEventListener('click', handleElementClick, true);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
}
function stopPickingMode() {
    if (!isPicking)
        return;
    console.log("Content script: Stopping picking mode.");
    isPicking = false;
    pickingMode = null;
    document.body.style.setProperty('cursor', 'default', 'important');
    document.removeEventListener('click', handleElementClick, true);
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    highlightElement(null);
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log("Content script: Listener invoked.");
    if (message) {
        console.log("Content script: Message object exists.");
        try {
            const msgType = message.type;
            console.log("Content script: Message type is:", msgType);
        }
        catch (e) {
            console.error("Content script: ERROR accessing message.type:", e);
        }
    }
    else {
        console.log("Content script: Message object is null or undefined.");
        return false;
    }
    if (message.type === 'CHECK_CONTENT_SCRIPT_READY') {
        console.log("Content script: Matched CHECK_CONTENT_SCRIPT_READY");
        sendResponse({ ready: true });
        return true;
    }
    else if (message.type === 'START_ELEMENT_PICKING') {
        console.log("Content script: Matched START_ELEMENT_PICKING");
        startPickingMode('error');
        sendResponse({ status: "Error picking mode started" });
        return true;
    }
    else if (message.type === 'START_PLAN_ELEMENT_PICKING') {
        console.log("Content script: Matched START_PLAN_ELEMENT_PICKING");
        startPickingMode('plan');
        sendResponse({ status: "Plan picking mode started" });
        return true;
    }
    else {
        console.warn(`Content script: Message type '${message?.type}' did not match any known handlers.`);
    }
    console.log("Content script: Message handler falling through (may indicate an unhandled message or error).");
    return false;
});
setTimeout(() => {
    try {
        chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("Content script: Could not send readiness message to background: ", chrome.runtime.lastError.message);
            }
            else {
                console.log("Content script: Sent readiness message to background.", response);
            }
        });
    }
    catch (e) {
        console.warn("Content script: Error sending readiness message: ", e);
    }
}, 500);
