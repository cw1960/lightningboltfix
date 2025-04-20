// Main JavaScript file
console.log("Main.js script loaded");

document.addEventListener("DOMContentLoaded", function() {
  console.log("Main.js DOMContentLoaded event fired");
  
  // Initialize Supabase client
  const SUPABASE_URL = "https://myqbmklllyhjvasqstbz.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cWJta2xsbHloanZhc3FzdGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3NDE2OTAsImV4cCI6MjA2MDMxNzY5MH0.epcZM5t5oFKg-u03kqafwXdeiMKQs_32qTsuejd8zr0";
  
  // Create Supabase client using the global Supabase object
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Global variables
  let currentUser = null;
  let isFirstTimeUser = true; // Default to true for first-time experience
  let otherApiProvider = ""; // Store the name of the other API provider
  
  // Check if user has completed onboarding
  async function checkOnboardingStatus(userId) {
    try {
      console.log("Checking onboarding status for user:", userId);
      
      const { data, error } = await supabase
        .from('user_settings')
        .select('onboarding_completed')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error("Error checking onboarding status:", error);
        return false;
      }
      
      console.log("Onboarding status data:", data);
      return data && data.onboarding_completed;
    } catch (error) {
      console.error("Exception in checkOnboardingStatus:", error);
      return false;
    }
  }
  
  // Check if this is the first time the user is using the extension
  async function checkFirstTimeUser() {
    try {
      // Check if we have a record of this being the first time
      const firstTimeFlag = await chrome.storage.local.get(['isFirstTime']);
      
      if (firstTimeFlag.isFirstTime === false) {
        console.log("Not first time user (from storage)");
        return false;
      }
      
      // If we don't have a record, assume it's the first time
      console.log("First time user (no record found)");
      return true;
    } catch (error) {
      console.error("Exception in checkFirstTimeUser:", error);
      return true; // Assume first time if we can't check
    }
  }
  
  // Check auth state after splash screen is hidden
  async function checkAuthState() {
    console.log("Checking auth state");
    
    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error("Error checking auth state:", error);
        isFirstTimeUser = await checkFirstTimeUser();
        
        if (isFirstTimeUser) {
          console.log("First time user, showing onboarding");
          showOnboardingView();
          showOnboardingStep(1);
        } else {
          console.log("Returning user, showing auth view");
          showAuthView();
        }
        return;
      }
      
      if (data && data.session) {
        currentUser = data.session.user;
        console.log("User is signed in:", currentUser);
        
        // Check if user has completed onboarding
        const onboardingCompleted = await checkOnboardingStatus(currentUser.id);
        
        if (onboardingCompleted) {
          console.log("Onboarding completed, showing main app");
          showMainAppView();
        } else {
          console.log("Onboarding not completed, checking API keys");
          
          // Check if user has API keys
          const hasApiKeys = await checkUserApiKeys(currentUser.id);
          
          if (hasApiKeys) {
            console.log("User has API keys, showing main app");
            showMainAppView();
          } else {
            console.log("User doesn't have API keys, showing onboarding step 2");
            showOnboardingView();
            showOnboardingStep(2);
          }
        }
      } else {
        console.log("No active session found");
        
        // Check if this is the first time the user is using the extension
        isFirstTimeUser = await checkFirstTimeUser();
        
        if (isFirstTimeUser) {
          console.log("First time user, showing onboarding");
          showOnboardingView();
          showOnboardingStep(1);
        } else {
          console.log("Returning user, showing auth view");
          showAuthView();
        }
      }
    } catch (error) {
      console.error("Exception in checkAuthState:", error);
      showAuthView();
    }
  }
  
  // Check if user has API keys
  async function checkUserApiKeys(userId) {
    try {
      console.log("Checking API keys for user:", userId);
      
      const { data, error } = await supabase
        .from('user_apis')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error("Error checking user API keys:", error);
        return false;
      }
      
      console.log("API keys data:", data);
      
      // If we have "other" API data, store the provider name
      if (data && data.other_api_provider) {
        otherApiProvider = data.other_api_provider;
        
        // Update the "Other LLM" option in the radio group
        updateOtherLLMOption();
      }
      
      return !!(data && (data.anthropic_api || data.gemini_api || data.other_api));
    } catch (error) {
      console.error("Error in checkUserApiKeys:", error);
      return false;
    }
  }
  
  // Function to save API keys to Supabase
  async function saveApiKeysToSupabase(userId, email, claudeApiKey, geminiApiKey, otherApiKey, otherApiProvider) {
    try {
      console.log("Saving API keys for user:", userId);
      console.log("API keys to save:", {
        claudeApiKey: claudeApiKey ? "***" : null,
        geminiApiKey: geminiApiKey ? "***" : null,
        otherApiKey: otherApiKey ? "***" : null,
        otherApiProvider: otherApiProvider
      });
      
      // First check if user already has an entry
      const { data: existingData, error: fetchError } = await supabase
        .from('user_apis')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
        console.error("Error fetching existing API keys:", fetchError);
        return false;
      }
      
      let result;
      
      if (existingData) {
        // Update existing entry
        const updateData = {
          updated_at: new Date().toISOString()
        };
        
        if (claudeApiKey) updateData.anthropic_api = claudeApiKey;
        if (geminiApiKey) updateData.gemini_api = geminiApiKey;
        if (otherApiKey) updateData.other_api = otherApiKey;
        if (otherApiProvider) updateData.other_api_provider = otherApiProvider;
        
        console.log("Updating existing API keys with:", updateData);
        
        result = await supabase
          .from('user_apis')
          .update(updateData)
          .eq('user_id', userId);
      } else {
        // Insert new entry
        const insertData = {
          user_id: userId,
          email: email,
          anthropic_api: claudeApiKey || null,
          gemini_api: geminiApiKey || null,
          other_api: otherApiKey || null,
          other_api_provider: otherApiProvider || null
        };
        
        console.log("Inserting new API keys:", insertData);
        
        result = await supabase
          .from('user_apis')
          .insert(insertData);
      }
      
      if (result.error) {
        console.error("Error saving API keys to Supabase:", result.error);
        return false;
      } else {
        console.log("API keys saved to Supabase successfully");
        return true;
      }
    } catch (error) {
      console.error("Error in saveApiKeysToSupabase:", error);
      return false;
    }
  }
  
  // Function to save user settings to Supabase
  async function saveUserSettings(userId, defaultLLM, onboardingCompleted) {
    try {
      console.log("Saving user settings for user:", userId);
      
      const settings = {
        user_id: userId,
        updated_at: new Date().toISOString()
      };
      
      if (defaultLLM !== null) {
        settings.default_llm = defaultLLM;
      }
      
      if (onboardingCompleted !== null) {
        settings.onboarding_completed = onboardingCompleted;
      }
      
      console.log("Settings to save:", settings);
      
      const { error } = await supabase
        .from('user_settings')
        .upsert(settings);
      
      if (error) {
        console.error("Error saving user settings:", error);
        return false;
      } else {
        console.log("User settings saved successfully");
        return true;
      }
    } catch (error) {
      console.error("Error in saveUserSettings:", error);
      return false;
    }
  }
  
  // Function to update the "Other LLM" option in the radio group
  function updateOtherLLMOption() {
    const otherLLMOption = document.getElementById('otherLLMOption');
    const otherLLMLabel = document.getElementById('otherLLMLabel');
    
    if (otherApiProvider && otherLLMOption && otherLLMLabel) {
      otherLLMOption.style.display = 'block';
      otherLLMLabel.textContent = otherApiProvider;
    }
  }
  
  // Function to show auth view
  function showAuthView() {
    console.log("Showing auth view");
    document.getElementById("authView").style.display = "block";
    document.getElementById("onboardingView").style.display = "none";
    document.getElementById("mainAppView").style.display = "none";
    
    // Make sure sign in container is visible by default
    document.getElementById('signInContainer').style.display = 'block';
    document.getElementById('signUpContainer').style.display = 'none';
  }
  
  // Function to show onboarding view
  function showOnboardingView() {
    console.log("Showing onboarding view");
    document.getElementById("authView").style.display = "none";
    document.getElementById("onboardingView").style.display = "block";
    document.getElementById("mainAppView").style.display = "none";
  }
  
  // Function to show main app view
  function showMainAppView() {
    console.log("Showing main app view");
    document.getElementById("authView").style.display = "none";
    document.getElementById("onboardingView").style.display = "none";
    document.getElementById("mainAppView").style.display = "block";
  }
  
  // Function to show onboarding step
  function showOnboardingStep(step) {
    console.log("Showing onboarding step", step);
    
    // Hide all steps
    document.querySelectorAll('.onboarding-step').forEach(el => {
      el.style.display = 'none';
    });
    
    // Show current step
    const currentStepElement = document.getElementById(`onboardingStep${step}`);
    if (currentStepElement) {
      currentStepElement.style.display = 'block';
    } else {
      console.error(`Onboarding step ${step} not found`);
    }
  }
  
  // Event listeners for auth view
  // Sign in form
  const signInForm = document.getElementById('signInForm');
  if (signInForm) {
    signInForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const email = document.getElementById('signInEmail').value;
      const password = document.getElementById('signInPassword').value;
      
      console.log("Attempting to sign in with email:", email);
      
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (error) {
          console.error("Error signing in:", error);
          alert("Error signing in: " + error.message);
        } else {
          console.log("Signed in successfully:", data);
          currentUser = data.user;
          
          // Check if user has completed onboarding
          const onboardingCompleted = await checkOnboardingStatus(currentUser.id);
          
          if (onboardingCompleted) {
            showMainAppView();
          } else {
            // Check if user has API keys
            const hasApiKeys = await checkUserApiKeys(currentUser.id);
            
            if (hasApiKeys) {
              showMainAppView();
            } else {
              showOnboardingView();
              showOnboardingStep(2);
            }
          }
        }
      } catch (error) {
        console.error("Exception during sign in:", error);
        alert("An error occurred during sign in");
      }
    });
  }
  
  // Sign up form
  const signUpForm = document.getElementById('signUpForm');
  if (signUpForm) {
    signUpForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const firstName = document.getElementById('signUpFirstName').value;
      const email = document.getElementById('signUpEmail').value;
      const password = document.getElementById('signUpPassword').value;
      
      console.log("Attempting to sign up with email:", email);
      
      try {
        // First, check if the user already exists
        const { data: existingUser, error: checkError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (!checkError) {
          // User already exists
          console.log("User already exists, signing in instead");
          currentUser = existingUser.user;
          
          // Check if user has completed onboarding
          const onboardingCompleted = await checkOnboardingStatus(currentUser.id);
          
          if (onboardingCompleted) {
            showMainAppView();
          } else {
            // Check if user has API keys
            const hasApiKeys = await checkUserApiKeys(currentUser.id);
            
            if (hasApiKeys) {
              showMainAppView();
            } else {
              showOnboardingView();
              showOnboardingStep(2);
            }
          }
          return;
        }
        
        // User doesn't exist, proceed with sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName
            }
          }
        });
        
        if (error) {
          console.error("Error signing up:", error);
          alert("Error signing up: " + error.message);
        } else {
          console.log("Signed up successfully:", data);
          
          if (data.user) {
            currentUser = data.user;
            
            // Set first time flag to false
            chrome.storage.local.set({ isFirstTime: false });
            
            // Move to the next onboarding step
            showOnboardingView();
            showOnboardingStep(2);
          } else {
            // Some Supabase instances require email confirmation
            alert("Please check your email to confirm your account, then sign in.");
            showAuthView();
          }
        }
      } catch (error) {
        console.error("Exception during sign up:", error);
        alert("An error occurred during sign up");
      }
    });
  }
  
  // Onboarding step 1 form (sign up during onboarding)
  const onboardingStep1Next = document.getElementById('onboardingStep1Next');
  if (onboardingStep1Next) {
    onboardingStep1Next.addEventListener('click', async function() {
      const firstName = document.getElementById('onboardingFirstName').value;
      const email = document.getElementById('onboardingEmail').value;
      const password = document.getElementById('onboardingPassword').value;
      
      if (!firstName || !email || !password) {
        alert("Please fill in all fields to continue");
        return;
      }
      
      console.log("Attempting to sign up during onboarding with email:", email);
      
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName
            }
          }
        });
        
        if (error) {
          console.error("Error signing up during onboarding:", error);
          alert("Error signing up: " + error.message);
        } else {
          console.log("Signed up successfully during onboarding:", data);
          
          if (data.user) {
            currentUser = data.user;
            
            // Set first time flag to false
            chrome.storage.local.set({ isFirstTime: false });
            
            // Move to the next onboarding step
            showOnboardingStep(2);
          } else {
            // Some Supabase instances require email confirmation
            alert("Please check your email to confirm your account, then sign in.");
            showAuthView();
          }
        }
      } catch (error) {
        console.error("Exception during onboarding sign up:", error);
        alert("An error occurred during sign up");
      }
    });
  }
  
  // Switch to sign up
  const switchToSignUpButton = document.getElementById('switchToSignUp');
  if (switchToSignUpButton) {
    switchToSignUpButton.addEventListener('click', function() {
      document.getElementById('signInContainer').style.display = 'none';
      document.getElementById('signUpContainer').style.display = 'block';
    });
  }
  
  // Switch to sign in
  const switchToSignInButton = document.getElementById('switchToSignIn');
  if (switchToSignInButton) {
    switchToSignInButton.addEventListener('click', function() {
      document.getElementById('signUpContainer').style.display = 'none';
      document.getElementById('signInContainer').style.display = 'block';
    });
  }
  
  // Onboarding step 2 back button
  const onboardingStep2Back = document.getElementById('onboardingStep2Back');
  if (onboardingStep2Back) {
    onboardingStep2Back.addEventListener('click', function() {
      showOnboardingStep(1);
    });
  }
  
  // Onboarding step 2 next button
  const onboardingStep2Next = document.getElementById('onboardingStep2Next');
  if (onboardingStep2Next) {
    onboardingStep2Next.addEventListener('click', async function() {
      const claudeApiKey = document.getElementById('onboardingClaudeApiKey').value;
      const geminiApiKey = document.getElementById('onboardingGeminiApiKey').value;
      const otherApiKey = document.getElementById('onboardingOtherApiKey').value;
      const otherProvider = document.getElementById('onboardingOtherApiProvider').value;
      
      // Check if at least one API key is provided
      if (!claudeApiKey && !geminiApiKey && !otherApiKey) {
        alert('Please provide at least one API key to continue');
        return;
      }
      
      // If other API key is provided, make sure provider is also specified
      if (otherApiKey && !otherProvider) {
        alert('Please specify the Other API Provider name');
        return;
      }
      
      // Save API keys to chrome.storage
      chrome.storage.sync.set({
        claudeApiKey,
        geminiApiKey,
        otherApiKey,
        otherApiProvider: otherProvider
      });
      
      // Store for later use
      otherApiProvider = otherProvider;
      
      // Update the "Other LLM" option in the radio group
      updateOtherLLMOption();
      
      // Also save to Supabase if user is logged in
      if (currentUser) {
        const saved = await saveApiKeysToSupabase(
          currentUser.id, 
          currentUser.email, 
          claudeApiKey, 
          geminiApiKey, 
          otherApiKey,
          otherProvider
        );
        
        if (!saved) {
          console.error("Failed to save API keys to Supabase");
          // Continue anyway, as we've saved to chrome.storage
        }
      }
      
      showOnboardingStep(3);
    });
  }
  
  // Onboarding step 3 back button
  const onboardingStep3Back = document.getElementById('onboardingStep3Back');
  if (onboardingStep3Back) {
    onboardingStep3Back.addEventListener('click', function() {
      showOnboardingStep(2);
    });
  }
  
  // Onboarding step 3 next button
  const onboardingStep3Next = document.getElementById('onboardingStep3Next');
  if (onboardingStep3Next) {
    onboardingStep3Next.addEventListener('click', async function() {
      const selectedLLM = document.querySelector('input[name="defaultLLM"]:checked').value;
      
      // Save default LLM to chrome.storage
      chrome.storage.sync.set({ defaultLLM: selectedLLM });
      
      // Save to Supabase if user is logged in
      if (currentUser) {
        const saved = await saveUserSettings(currentUser.id, selectedLLM, false);
        
        if (!saved) {
          console.error("Failed to save user settings to Supabase");
          // Continue anyway, as we've saved to chrome.storage
        }
      }
      
      showOnboardingStep(4);
    });
  }
  
  // Onboarding step 4 back button
  const onboardingStep4Back = document.getElementById('onboardingStep4Back');
  if (onboardingStep4Back) {
    onboardingStep4Back.addEventListener('click', function() {
      showOnboardingStep(3);
    });
  }
  
  // Onboarding step 4 finish button
  const onboardingStep4Finish = document.getElementById('onboardingStep4Finish');
  if (onboardingStep4Finish) {
    onboardingStep4Finish.addEventListener('click', async function() {
      // Mark onboarding as completed
      if (currentUser) {
        const saved = await saveUserSettings(currentUser.id, null, true);
        
        if (!saved) {
          console.error("Failed to mark onboarding as completed in Supabase");
          // Continue anyway
        }
      }
      
      // Set first time flag to false
      chrome.storage.local.set({ isFirstTime: false });
      
      showMainAppView();
    });
  }
  
  // Sign out button
  const signOutButton = document.getElementById('signOutButton');
  if (signOutButton) {
    signOutButton.addEventListener('click', async function() {
      try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
          console.error("Error signing out:", error);
          alert("Error signing out: " + error.message);
        } else {
          console.log("Signed out successfully");
          currentUser = null;
          showAuthView();
        }
      } catch (error) {
        console.error("Exception during sign out:", error);
        alert("An error occurred during sign out");
      }
    });
  }
  
  // Auth state change listener
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth state changed:", event);
    
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      console.log("User signed in:", currentUser);
      
      // Check if user has completed onboarding
      checkOnboardingStatus(currentUser.id).then(onboardingCompleted => {
        if (onboardingCompleted) {
          showMainAppView();
        } else {
          // Check if user has API keys
          checkUserApiKeys(currentUser.id).then(hasApiKeys => {
            if (hasApiKeys) {
              showMainAppView();
            } else {
              showOnboardingView();
              showOnboardingStep(2);
            }
          });
        }
      });
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      console.log("User signed out");
      
      // Check if this is the first time the user is using the extension
      checkFirstTimeUser().then(isFirst => {
        if (isFirst) {
          showOnboardingView();
          showOnboardingStep(1);
        } else {
          showAuthView();
        }
      });
    }
  });
  
  // Make functions globally available
  console.log("Making functions globally available");
  window.checkAuthState = checkAuthState;
  window.showAuthView = showAuthView;
  window.showOnboardingView = showOnboardingView;
  window.showMainAppView = showMainAppView;
  window.showOnboardingStep = showOnboardingStep;
  
  console.log("Global functions set:", {
    checkAuthState: !!window.checkAuthState,
    showAuthView: !!window.showAuthView,
    showOnboardingView: !!window.showOnboardingView,
    showMainAppView: !!window.showMainAppView,
    showOnboardingStep: !!window.showOnboardingStep
  });
});
