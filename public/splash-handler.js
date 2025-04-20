// Splash screen handler
console.log("Splash handler script loaded");

document.addEventListener("DOMContentLoaded", function() {
  console.log("Splash handler DOMContentLoaded event fired");
  
  // Hide splash screen after 2 seconds
  console.log("Setting timeout to hide splash screen");
  setTimeout(function() {
    console.log("Timeout callback executed - hiding splash screen");
    const splashScreen = document.getElementById("splashScreen");
    console.log("Splash screen element:", splashScreen);
    
    if (splashScreen) {
      splashScreen.style.display = "none";
      console.log("Splash screen hidden by splash-handler.js");
    } else {
      console.error("Splash screen element not found by splash-handler.js");
    }
  }, 2000);
});
