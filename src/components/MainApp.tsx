import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';
import ExtPay from 'extpay'; // <-- Uncomment ExtPay import
import SettingsTab from './SettingsTab'; // Import SettingsTab
import AnalyticsTab from './AnalyticsTab'; // Import AnalyticsTab
import FeedbackTab from './FeedbackTab';

// Initialize ExtPay - Use your Extension ID
const extpay = ExtPay('lightning-bolt-fix'); // <-- Updated ExtensionPay initialization

// Define structure for a single LLM configuration row
// Matches the llm_user_configurations table
interface LlmConfiguration {
    id: string; // UUID
    profile_id: string; // UUID
    provider_type: 'Anthropic' | 'Google' | 'OpenAI' | 'Azure OpenAI' | 'Custom' | 'Other';
    model_name: string;
    api_key: string;
    api_endpoint: string | null;
    is_default: boolean;
    created_at: string; // timestamp
}

interface MainAppProps {
  session: Session;
}

const MainApp: React.FC<MainAppProps> = ({ session }) => {
  // --- State Variables ---
  const [errorMessage, setErrorMessage] = useState('');
  const [errantCode, setErrantCode] = useState('');
  const [fixedCode, setFixedCode] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyButtonText, setCopyButtonText] = useState('Copy Fixed Code'); // State for button text
  const [activeTab, setActiveTab] = useState('fix'); // Add state for active tab ('fix', 'settings', 'analytics')
  const [fixSavedCounter, setFixSavedCounter] = useState(0); // <-- Add counter state
  const [isPickingElement, setIsPickingElement] = useState(false); // State for error picker mode
  const [errorFixPlan, setErrorFixPlan] = useState(''); // <-- Add state for the plan
  const [isPickingPlanElement, setIsPickingPlanElement] = useState(false); // <-- Add state for plan picker mode
  const [showSettings, setShowSettings] = useState(false); // State to toggle settings tab
  const [refreshCounter] = useState(0); // Remove setRefreshCounter, only keep refreshCounter if used
  const [copyExplanationText, setCopyExplanationText] = useState('Copy Explanation');
  const [isExplanationOpen, setIsExplanationOpen] = useState(false); // Add this line
  const [mainButtonMode, setMainButtonMode] = useState<'fix' | 'copy'>('fix');

  const FREE_FIX_LIMIT = 10;

  const YOUTUBE_URL = 'https://youtu.be/zWlzxSXmpxY';

  // --- Message Listener Effect ---
  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: (response?: any) => void) => {
      console.log("MainApp received message:", message, "from:", sender);

      if (message.type === 'ELEMENT_PICKED') {
        console.log("Received picked element text:", message.payload);
        setErrorMessage(message.payload);
        setIsPickingElement(false); // Turn off error picker mode
        sendResponse({ status: "ELEMENT_PICKED received" }); // Acknowledge message
        return true; // Indicate async response (though we send it immediately)
      }

      if (message.type === 'PLAN_ELEMENT_PICKED') {
        console.log("Received picked plan text:", message.payload);
        setErrorFixPlan(message.payload); // <-- Set plan state
        setIsPickingPlanElement(false); // <-- Turn off plan picker mode
        sendResponse({ status: "PLAN_ELEMENT_PICKED received" });
        return true;
      }

      // If message is not handled, return false or undefined
      // to avoid keeping the channel open unnecessarily.
      return false;
    };
    
    // Access chrome via window cast
    if ((window as any).chrome?.runtime?.onMessage) {
        (window as any).chrome.runtime.onMessage.addListener(messageListener);
    }
    return () => {
      // Access chrome via window cast for removal
      if ((window as any).chrome?.runtime?.onMessage) {
          (window as any).chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, []); // Dependencies are correct (empty array)

  // --- Reset Handler ---
  const handleReset = () => {
    setErrorMessage('');
    setErrantCode('');
    setFixedCode(null);
    setExplanation(null);
    setError(null);
    setLoading(false);
    setCopyButtonText('Copy Fixed Code');
    setIsPickingElement(false);
    setErrorFixPlan('');
    setIsPickingPlanElement(false);
    setMainButtonMode('fix');
    console.log('State reset for new error.');
  };

  // --- Helper to check content script readiness via background script ---
  const checkContentScriptReady = async (tabId: number): Promise<boolean> => {
    console.log(`MainApp: Checking readiness for tab ${tabId}`);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_CONTENT_SCRIPT_READY', tabId });
      console.log(`MainApp: Readiness response for tab ${tabId}:`, response);
      return response?.ready === true;
    } catch (error) {
      console.error(`MainApp: Error checking content script readiness for tab ${tabId}:`, error);
      return false; // Assume not ready if error occurs
    }
  };

  // --- Picker Click Handlers ---
  const handlePickElementClick = async () => {
    setIsPickingElement(true);
    setError(null);
    let tabId: number | undefined = undefined;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = activeTab?.id;
      if (!tabId) throw new Error('Could not find active tab.');

      // Check readiness *before* sending start message
      const isReady = await checkContentScriptReady(tabId);
      if (!isReady) {
          throw new Error("Content script not ready on the active page. Please reload the page or try again.");
      }

      console.log('Sending START_ELEMENT_PICKING to tab:', tabId);
      await chrome.tabs.sendMessage(tabId, { type: 'START_ELEMENT_PICKING' });
    } catch (err: any) {
      console.error("Error starting element picker:", err);
      setError(`Failed to start element picker: ${err.message}`);
      setIsPickingElement(false); // Reset state on error
    }
  };

  // --- Handler for the *new* Plan Picker Button ---
  const handlePickPlanElementClick = async () => {
    setIsPickingPlanElement(true);
    setError(null);
    let tabId: number | undefined = undefined;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = activeTab?.id;
      if (!tabId) throw new Error('Could not find active tab.');

      const isReady = await checkContentScriptReady(tabId);
      if (!isReady) {
          throw new Error("Content script not ready on the active page. Please reload the page or try again.");
      }

      console.log('Sending START_PLAN_ELEMENT_PICKING to tab:', tabId);
      // Send a distinct message type for the plan picker
      await chrome.tabs.sendMessage(tabId, { type: 'START_PLAN_ELEMENT_PICKING' }); 
    } catch (err: any) {
      console.error("Error starting plan element picker:", err);
      setError(`Failed to start plan element picker: ${err.message}`);
      setIsPickingPlanElement(false); // Reset state on error
    }
  };

  // --- Handle Fix Code Logic ---
  const handleFixCode = async () => {
    const extUser = await extpay.getUser();
    setLoading(true);
    setError(null);
    setFixedCode(null);
    setExplanation(null);
    setMainButtonMode('fix');

    let defaultLlmConfig: LlmConfiguration | null = null; // Store the fetched config

    try {
      // --- Payment & Free Fix Check (Keep this logic as is) --- 
      let canProceed = false;
      try {
        // Uncomment ExtPay check Start
        if (extUser.paid) {
            console.log("User is paid. Proceeding with fix.");
            canProceed = true;
        } else {
        // Uncomment ExtPay check End

            // --- Start: Assume user is NOT paid (Free Tier Logic) ---
            console.log("User is not paid. Checking free fixes..."); // Keep original log
            // Fetch profile specifically for free fixes count
            const { data: freeFixProfile, error: freeFixError } = await supabase
              .from('profiles')
              .select('free_fixes_used, use_builtin_keys')
              .eq('id', session.user.id)
              .maybeSingle<{ free_fixes_used: number, use_builtin_keys?: boolean }>();

            if (freeFixError) throw new Error("Could not verify free fix count.");
            
            const fixesUsed = freeFixProfile?.free_fixes_used ?? 0;
            console.log(`Free fixes used: ${fixesUsed} / ${FREE_FIX_LIMIT}`);
            if (fixesUsed < FREE_FIX_LIMIT) {
              canProceed = true;
            } else {
              setError("You have used all your free fixes. Please upgrade to continue.");
              setLoading(false);
              return;
            }
            // --- End: Assume user is NOT paid (Free Tier Logic) ---

        // Uncomment ExtPay check Else block Start
        }
        // Uncomment ExtPay check Else block End
      } catch (extPayCheckError: any) {
          console.error("Error during payment/free fix check:", extPayCheckError);
          throw extPayCheckError;
      }

      if (!canProceed) {
          throw new Error("Could not proceed with fix due to payment or free limit status.");
      }
      // --- End Payment & Free Fix Check ---

      // 1. Fetch the user's default LLM configuration
      console.log('Frontend user id:', session.user.id); // Debug log for user id
      let configData, configError;
      ({ data: configData, error: configError } = await supabase
        .from('llm_user_configurations')
        .select('*') // Select all columns from the config table
        .eq('profile_id', session.user.id)
        .eq('is_default', true)
        .limit(1) // Should only be one default
        .maybeSingle<LlmConfiguration>());
      console.log('Fetched default LLM config (first try):', configData, configError);
      if (!configData) {
        // Force a refresh: try fetching again
        await new Promise(res => setTimeout(res, 500)); // Small delay to allow backend to catch up
        ({ data: configData, error: configError } = await supabase
          .from('llm_user_configurations')
          .select('*')
          .eq('profile_id', session.user.id)
          .eq('is_default', true)
          .limit(1)
          .maybeSingle<LlmConfiguration>());
        console.log('Fetched default LLM config (second try):', configData, configError);
      }
      if (configError) throw new Error(`Failed to fetch LLM configuration: ${configError.message}`);
      if (!configData) throw new Error('No default LLM configuration found. Please set one in Settings.');
      defaultLlmConfig = configData; // Assign to the outer scope variable

      // --- API Key Selection Logic ---
      let apiKey: string = defaultLlmConfig?.api_key || '';
      
      // 2. Determine API details based on the provider type
      const llmProvider = defaultLlmConfig.provider_type;
      const llmModelName = defaultLlmConfig.model_name;
      let apiUrl: string = '';
      let requestBody: any = {};
      let headers: HeadersInit = { 'Content-Type': 'application/json' };

      // Construct the shared prompt content - **ULTRA EXPLICIT for FULL FILE output**
      const promptContent =
        'Error Message:\n' + errorMessage + '\n\n' +
        'Plan to Fix the Error:\n' + errorFixPlan + '\n\n' +
        'Errant Code (Full File Content):\n' +
        '```\n' + errantCode + '\n```\n\n' +
        '## CRITICAL TASK & STRICT REQUIREMENTS ##\n' +
        'Your ONLY goal is to return the **COMPLETE, UNMODIFIED ORIGINAL CODE PLUS THE NECESSARY FIX** based on the Plan and Error Message.\n' +
        'You MUST fix the errant code provided above, strictly following the Plan provided.\n' +
        '\n' +
        '## RESPONSE FORMAT (MANDATORY) ##\n' +
        'You MUST return your response in **TWO CLEARLY SEPARATED BLOCKS**:\n' +
        '1. **Explanation Block:**\n' +
        '   - A concise explanation of the error and the fix applied (informed by the Plan).\n' +
        '   - **DO NOT** include any code in this block.\n' +
        '   - End this block before the code block begins.\n' +
        '2. **Fixed Code Block:**\n' +
        '   - The **ENTIRE, COMPLETE, UNALTERED ORIGINAL CODE PLUS THE FIX**.\n' +
        '   - This block MUST be in a single markdown code block, e.g. ```javascript ... ``` or ```python ... ```\n' +
        '   - **DO NOT** include any explanation, comments, or text outside the code block.\n' +
        '\n' +
        '### ABSOLUTE RULES:\n' +
        '- The explanation and code must be in SEPARATE blocks.\n' +
        '- The code block must be the ONLY code in your response.\n' +
        '- DO NOT put explanation or comments inside the code block.\n' +
        '- DO NOT return both in a single block.\n' +
        '- DO NOT add extra text before or after the code block.\n' +
        '- DO NOT use ellipses (`...`) or placeholders (e.g., // ... rest of code ...).\n' +
        '- DO NOT summarize, truncate, or comment out existing, functional code.\n' +
        '- ONLY modify the lines necessary to correct the error according to the Plan.\n' +
        '\n' +
        '### TEMPLATE (MANDATORY):\n' +
        'Explanation:\n' +
        'Your explanation here.\n' +
        '\n' +
        '```language\n' +
        '...COMPLETE FIXED CODE HERE...\n' +
        '```\n' +
        '\n' +
        '## FINAL CHECK & CONSEQUENCE ##\n' +
        'Failure to provide the explanation and code in SEPARATE blocks, or to include the COMPLETE and UNALTERED original code (plus the fix) in the code block, will render the output useless and break the application. Return ONLY the explanation (including the confirmation phrase) and the **COMPLETE** fixed code block, in the format above.';

      switch (llmProvider) {
        case 'Anthropic':
            apiUrl = 'https://api.anthropic.com/v1/messages';
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            // Required for direct browser access to Anthropic API
            headers['anthropic-dangerous-direct-browser-access'] = 'true'; 
            requestBody = {
              // Consider making model configurable in settings later?
              model: "claude-3-5-sonnet-20240620", 
              max_tokens: 2048,
              messages: [{ role: "user", content: promptContent }]
            };
            break;
        case 'Google':
             // Use Gemini 1.5 Flash (Free Tier)
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
            requestBody = {
              contents: [{ parts: [{ text: promptContent }] }]
              // Add generationConfig if needed (temperature, max_tokens etc)
              // generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
            };
            break;
        case 'OpenAI':
            apiUrl = 'https://api.openai.com/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            requestBody = {
                // Assuming a default model - make configurable later?
                model: "gpt-4o", 
                messages: [{ role: "user", content: promptContent }],
                max_tokens: 2048
            };
            break;
        case 'Azure OpenAI':
            if (!defaultLlmConfig.api_endpoint) {
                throw new Error('API Endpoint is missing for Azure OpenAI configuration.');
            }
            apiUrl = defaultLlmConfig.api_endpoint; // Endpoint includes deployment name usually
            headers['api-key'] = apiKey; // Azure uses 'api-key' header
            requestBody = {
                // Azure request body structure (example - check specific deployment)
                messages: [{ role: "user", content: promptContent }],
                max_tokens: 2048
            };
            break;
        case 'Other':
            if (!defaultLlmConfig.api_endpoint) {
                throw new Error('API Endpoint is missing for Other configuration.');
            }
            apiUrl = defaultLlmConfig.api_endpoint;
            // Assuming a generic Bearer token for custom, might need adjustment
            headers['Authorization'] = `Bearer ${apiKey}`;
             // Assuming a generic request body, might need adjustment
            requestBody = {
                model: llmModelName, // Pass model name
                messages: [{ role: "user", content: promptContent }],
                max_tokens: 2048
            };
             console.log(`Using Other provider: ${llmModelName} at ${apiUrl}`);
            break;
        default:
            // Should not happen due to DB constraints, but good to have
            throw new Error(`Unsupported LLM provider type: ${llmProvider}`);
      }

      // 3. Make the API call
      console.log(`Calling ${llmProvider} API (${llmModelName}) at ${apiUrl}`);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorBodyText = 'Unknown API error';
        try {
             errorBodyText = await response.text(); // Try to get more detail
        } catch (e) {/* Ignore parsing error */} 
        throw new Error(`API Error (${response.status} ${response.statusText}): ${errorBodyText}`);
      }

      const data = await response.json();

      // 4. Parse the response (Provider-specific) - IMPROVED PARSING
      let fullResponseText = ''; // Store the full text response
      let explanationText = 'Could not parse explanation.';
      let fixedCodeBlock = 'Could not parse fixed code.';
      let rawCodeBlockMatch = null; // Store the full match including ``` markers

      try {
        // --- Get full text from provider ---
        if (llmProvider === 'Anthropic') {
            if (data.content && data.content.length > 0 && data.content[0].type === 'text') {
                fullResponseText = data.content[0].text;
            }
        } else if (llmProvider === 'Google') {
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts?.length > 0) {
                fullResponseText = data.candidates[0].content.parts[0].text;
            }
        } else if (llmProvider === 'OpenAI' || llmProvider === 'Azure OpenAI' || llmProvider === 'Other') {
            if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
                fullResponseText = data.choices[0].message.content;
            }
        }

        // --- Extract Code Block and Explanation ---
        if (fullResponseText) {
            // Find the code block (match includes the ``` markers)
            // Corrected Regex: Match ``` optionally followed by language name, newline, content, newline, ```
            const codeBlockRegex = /(\`\`\`[a-zA-Z]*\n[\s\S]*?\n\`\`\`)/;
            const codeMatch = fullResponseText.match(codeBlockRegex);
            if (codeMatch && codeMatch[1]) {
                rawCodeBlockMatch = codeMatch[1]; // Store the full matched block
                // Extract the code content *inside* the markers
                // Corrected Regex: Match inside ```[language]\n ... \n```
                const innerCodeRegex = /\`\`\`[a-zA-Z]*\n([\s\S]*?)\n\`\`\`/;
                const innerCodeMatch = rawCodeBlockMatch.match(innerCodeRegex);
                fixedCodeBlock = innerCodeMatch && innerCodeMatch[1] ? innerCodeMatch[1].trim() : 'Could not parse code content.';
                
                // Explanation is the full text minus the code block
                explanationText = fullResponseText.replace(rawCodeBlockMatch, '').trim();
            } else {
                // No code block found, assume entire response is explanation
                explanationText = fullResponseText;
                fixedCodeBlock = 'No code block found in response.';
            }
        } else {
             explanationText = `Could not extract text response from ${llmProvider}.`;
             fixedCodeBlock = `Could not extract text response from ${llmProvider}.`;
        }

      } catch (parseError: any) {
          console.error("Error parsing LLM response:", parseError);
          setError(`Failed to parse response from ${llmProvider}: ${parseError.message}`);
          // Keep default 'Could not parse...' messages if specific parsing failed
          explanationText = explanationText || 'Error during parsing.';
          fixedCodeBlock = fixedCodeBlock || 'Error during parsing.';
      }

      setExplanation(explanationText);
      setFixedCode(fixedCodeBlock);
      setMainButtonMode('copy');

      // 5. Save the results to the database
      const { error: saveError } = await supabase.from('fixes').insert({
        user_id: session.user.id,
        error_message: errorMessage,
        errant_code: errantCode,
        fixed_code: fixedCodeBlock,
        llm_explanation: explanationText,
        llm_provider: llmProvider, // Keep original provider string
        llm_configuration_id: defaultLlmConfig.id // Link to the config used
      });

      if (saveError) {
        console.error('[handleFixCode] Failed to save fix details:', saveError);
        // Display the actual error message from Supabase
        const detailedMessage = saveError.message || 'Unknown database error during history save';
        setError(`Code fixed, but failed to save history: ${detailedMessage}`);
      } else {
        // Add log before incrementing counter
        console.log("[handleFixCode] Fix saved successfully. Incrementing fixSavedCounter.");
        setFixSavedCounter(prev => prev + 1);
      
        // Increment free_fixes_used for free users (extUser is in scope here)
        if (!extUser.paid) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('free_fixes_used')
            .eq('id', session.user.id)
            .single();
      
          if (!profileError && profile) {
            const newCount = (profile.free_fixes_used ?? 0) + 1;
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ free_fixes_used: newCount })
              .eq('id', session.user.id);
      
            if (updateError) {
              console.error('Failed to increment free_fixes_used:', updateError);
            } else {
              console.log('Successfully incremented free_fixes_used to', newCount);
            }
          } else {
            console.error('Failed to fetch profile for incrementing free_fixes_used:', profileError);
          }
        }
      }
    } catch (err: any) {
      console.error('handleFixCode Error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };
  // --- Handle Fix Code Logic --- END

  // --- Copy Handler --- START
  const handleCopyCode = () => {
    if (!fixedCode) return; // Should not happen if button is shown, but good practice

    navigator.clipboard.writeText(fixedCode).then(() => {
      // Success!
      setCopyButtonText('Copied!');
      // Reset button text after a short delay
      setTimeout(() => setCopyButtonText('Copy Fixed Code'), 2000);
    }).catch(() => {
      // Failure
      setCopyButtonText('Copy Failed');
      setError('Failed to copy code to clipboard.'); // Use existing error state
      setTimeout(() => setCopyButtonText('Copy Fixed Code'), 3000); // Reset later on failure
    });
  };
  // --- Copy Handler --- END

  // --- Toggle Settings --- 
  const toggleSettings = () => {
      setShowSettings(!showSettings);
      // Optionally trigger refresh when settings are opened?
      // setRefreshCounter(prev => prev + 1); 
  };

  // --- Add handler for main button copy
  const handleMainCopyCode = () => {
    if (!fixedCode) return;
    navigator.clipboard.writeText(fixedCode).then(() => {
      setCopyButtonText('Copied!');
      setTimeout(() => setCopyButtonText('Copy Fixed Code'), 2000);
    }).catch(() => {
      setCopyButtonText('Copy Failed');
      setTimeout(() => setCopyButtonText('Copy Fixed Code'), 3000);
    });
  };

  // --- Render Logic ---
  return (
    <div className="container">
      {/* Header with conditional Settings button */}
      <div className="header">
          {/* Logo */}
          <div className="logo">
              <img src="icons/icon128.png" alt="Lightning Bolt Fix V3 Logo" style={{width:'32px',height:'32px',marginRight:'8px',verticalAlign:'middle'}} />
              <h1>Lightning Bolt Fix V3</h1>
          </div>
          {/* Toggle Settings Button */}
          <button onClick={toggleSettings} className="button button-secondary">
              {showSettings ? 'Back to Fix' : 'Settings'}
          </button>
      </div>

      {/* Tabs Menu (only one instance) */}
      <div className="tabs">
        <div 
          className={`tab ${activeTab === 'fix' ? 'active' : ''}`}
          onClick={() => setActiveTab('fix')}
        >
          <div style={{display:'flex',alignItems:'center',marginBottom:'4px'}}>
            <span style={{display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:'#e6007a',marginRight:'4px'}}></span>
            <span style={{fontWeight:'bold',fontSize:'1em'}}>Fix Code</span>
          </div>
        </div>
        <div 
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <div style={{display:'flex',alignItems:'center',marginBottom:'4px'}}>
            <span style={{display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:'#e6007a',marginRight:'4px'}}></span>
            <span style={{fontWeight:'bold',fontSize:'1em'}}>Settings</span>
          </div>
        </div>
        <div 
          className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <div style={{display:'flex',alignItems:'center',marginBottom:'4px'}}>
            <span style={{display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:'#e6007a',marginRight:'4px'}}></span>
            <span style={{fontWeight:'bold',fontSize:'1em'}}>Analytics</span>
          </div>
        </div>
        <div 
          className={`tab ${activeTab === 'feedback' ? 'active' : ''}`}
          onClick={() => setActiveTab('feedback')}
        >
          <div style={{display:'flex',alignItems:'center',marginBottom:'4px'}}>
            <span style={{display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:'#e6007a',marginRight:'4px'}}></span>
            <span style={{fontWeight:'bold',fontSize:'1em'}}>Feedback</span>
          </div>
        </div>
      </div>

      {/* Special Content Script Error Message (just below Tabs) */}
      {error && error.includes("Content script not ready") && (
        <div className="box error" style={{ border: '1px solid #ef4444', background: '#444', marginTop: 12, marginBottom: 12 }}>
          <p style={{ fontWeight: 'bold' }}>Error:</p>
          <p style={{ marginTop: 8 }}>
            When loading the extension you'll sometimes have to refresh the active page.<br />
            Please click the <b>Reload Page</b> button and then begin using the extension.
          </p>
          <button
            className="button"
            onClick={() => {
              setError(null); // Hide the error message
              if (window.chrome?.tabs) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
                });
              }
            }}
            style={{ marginTop: 8 }}
          >
            Reload Page
          </button>
        </div>
      )}

      {/* Conditional Rendering: Settings Tab or Main Fix UI */}
      {showSettings ? (
          <SettingsTab session={session} refreshTrigger={refreshCounter} /> // <<< PASS REFRESH TRIGGER
      ) : (
          <>
              {/* Main Fix UI */}
              {/* Tab Content */} 
              <div id="fixTab" className={`tab-content ${activeTab === 'fix' ? 'active' : ''}`}> 
                
                {/* Demo Video Link */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => window.open(YOUTUBE_URL, '_blank', 'noopener,noreferrer')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '0.92em',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: 0,
                      marginRight: 2,
                      opacity: 0.85,
                      fontWeight: 500,
                    }}
                    aria-label="Watch demo video"
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" style={{ verticalAlign: 'middle', marginRight: 4 }}><circle cx="24" cy="24" r="24" fill="#000" fillOpacity="0.3"/><polygon points="20,16 34,24 20,32" fill="#60a5fa"/></svg>
                    Watch Demo Video
                  </button>
                </div>

                {/* --- Add Fix New Error button inside Fix tab --- */}
                {/* Show button only if results are present or loading/error occurred */}
                {(fixedCode || explanation || loading || error) && (
                   <div style={{ marginBottom: '16px', textAlign: 'right' }}> {/* Align to right */} 
                     <button
                       className="button"
                       onClick={handleReset}
                       style={{
                         // Adjust style as needed
                         backgroundColor: (fixedCode && !loading && !error) ? '#28a745' : '#555',
                         padding: '4px 8px', // Smaller padding
                         fontSize: '0.9em'  // Slightly smaller font
                       }}
                     >
                       Fix New Error
                     </button>
                   </div>
                 )}

                {/* Error Message Input Area */} 
                <div className="box form-group"> 
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label htmlFor="errorMessageInput" style={{ marginBottom: 0 }}>Error Message</label>
                    {/* Add Picker Button - Renamed */}
                    <button 
                      id="pickElementButton"
                      className="button" 
                      onClick={handlePickElementClick} 
                      disabled={isPickingElement} 
                      style={{ padding: '4px 8px', fontSize: '0.8em'}} // Smaller button
                    >
                      {isPickingElement ? 'Picking...' : 'Select Error Message'} 
                    </button>
                  </div>
                  <input 
                    id="errorMessageInput" 
                    className="input" 
                    value={errorMessage} 
                    onChange={(e) => setErrorMessage(e.target.value)} 
                    placeholder="Paste error message here or use Pick Element" // Updated placeholder
                    disabled={loading} 
                  /> 
                </div> 
         
                {/* Plan Input Area (Moved) */}
                <div className="box form-group"> 
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label htmlFor="errorFixPlanInput" style={{ marginBottom: 0 }}>The Plan</label>
                    {/* Add Picker Button for Plan - Renamed */}
                    <button 
                      id="pickPlanElementButton"
                      className="button" 
                      onClick={handlePickPlanElementClick} 
                      disabled={isPickingPlanElement} 
                      style={{ padding: '4px 8px', fontSize: '0.8em'}}
                    >
                      {isPickingPlanElement ? 'Picking...' : 'Select "The Plan" Text'} 
                    </button>
                  </div>
                  <textarea 
                    id="errorFixPlanInput" 
                    className="textarea"  
                    value={errorFixPlan}  
                    onChange={(e) => setErrorFixPlan(e.target.value)}  
                    placeholder="Describe or pick the plan/steps to fix the error."
                    rows={3} // Shorter text area for plan
                    disabled={loading} 
                  ></textarea> 
                </div> 
         
                {/* Errant Code Input Area */} 
                <div className="box form-group"> 
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label htmlFor="errantCodeInput" style={{ marginBottom: 0 }}>Paste Full Code File Here</label>
                  </div>
                  <textarea 
                    id="errantCodeInput" 
                    className="textarea"  
                    value={errantCode}  
                    onChange={(e) => setErrantCode(e.target.value)}  
                    placeholder="Manually copy the full code from the file and paste it here." // Updated placeholder 
                    rows={10} 
                    disabled={loading} // No longer disabled by isPickingCode
                  ></textarea> 
                </div> 
         
                {/* Fix Code Button Area */} 
                <div style={{ textAlign: 'center' }}>
                  {mainButtonMode === 'fix' ? (
                    <button
                      className="button"
                      onClick={handleFixCode}
                      disabled={loading || !errorMessage || !errantCode}
                      style={{ backgroundColor: '#1488fc', color: 'white' }}
                    >
                      {loading ? <span className="loading"></span> : 'Fix Code'}
                    </button>
                  ) : (
                    <button
                      className="button"
                      onClick={handleMainCopyCode}
                      style={{ backgroundColor: '#28a745', color: 'white' }}
                    >
                      {copyButtonText}
                    </button>
                  )}
                </div>
         
                {/* Display Loading or Error */} 
                {loading && <div className="box"><span className="loading"></span> Processing...</div>} 
                {error && !loading && ( 
                  error.includes("Content script not ready") ? (
                    <div className="box error" style={{ border: '1px solid #ef4444', background: '#444' }}>
                      <p style={{ fontWeight: 'bold' }}>Error:</p>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{error}</p>
                      <p style={{ marginTop: 8 }}>
                        When loading the extension you'll sometimes have to refresh the active page.<br />
                        Please click the <b>Reload Page</b> button and then begin using the extension.
                      </p>
                      <button
                        className="button"
                        onClick={() => {
                          if (window.chrome?.tabs) {
                            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                              if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
                            });
                          }
                        }}
                        style={{ marginTop: 8 }}
                      >
                        Reload Page
                      </button>
                    </div>
                  ) : (
                    <div className="box error" style={{ border: '1px solid #ef4444', background: '#444' }}>
                      <p style={{ fontWeight: 'bold' }}>Error:</p>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{error}</p>
                    </div>
                  )
                )} 
         
                {/* Results Area */} 
                {!loading && !error && (explanation || fixedCode) && ( 
                  <div className="box"> 
                    {/* Collapsible Explanation Block */}
                    {explanation && (
                      <div style={{ marginBottom: '16px' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            userSelect: 'none',
                            background: '#23272f',
                            borderRadius: '4px',
                            padding: '8px 12px',
                            border: '1px solid #333',
                          }}
                          onClick={() => setIsExplanationOpen((open) => !open)}
                          aria-expanded={isExplanationOpen}
                          aria-controls="explanation-content"
                          tabIndex={0}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setIsExplanationOpen(open => !open); }}
                        >
                          <h2 style={{ margin: 0, fontSize: '1.1em' }}>Explanation</h2>
                          <span style={{ fontSize: '1.2em', marginLeft: 8 }}>{isExplanationOpen ? '▼' : '▶'}</span>
                        </div>
                        {isExplanationOpen && (
                          <div id="explanation-content" style={{ marginTop: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                              <button
                                className="button"
                                style={{ padding: '4px 8px', fontSize: '0.8em' }}
                                onClick={() => {
                                  if (!explanation) return;
                                  navigator.clipboard.writeText(explanation).then(() => {
                                    setCopyExplanationText('Copied!');
                                    setTimeout(() => setCopyExplanationText('Copy Explanation'), 2000);
                                  }).catch(_ => {
                                    setCopyExplanationText('Copy Failed');
                                    setTimeout(() => setCopyExplanationText('Copy Explanation'), 3000);
                                  });
                                }}
                              >
                                {copyExplanationText}
                              </button>
                            </div>
                            <p style={{ whiteSpace: 'pre-wrap' }}>{explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Fixed Code Block (always visible) */}
                    {fixedCode && (
                      <div style={{ marginTop: explanation ? '0' : '0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <h2>Fixed Code</h2>
                          <button
                            className="button"
                            style={{ padding: '4px 8px', fontSize: '0.8em', backgroundColor: '#28a745', color: 'white' }}
                            onClick={handleCopyCode}
                          >
                            {copyButtonText}
                          </button>
                        </div>
                        <pre className='result-code' style={{ whiteSpace: 'pre-wrap', background: '#1a1a1a', padding: '10px', borderRadius: '4px' }}>{fixedCode}</pre>
                      </div>
                    )}
                  </div> 
                )} 
              </div>

              <div id="settingsTab" className={`tab-content ${activeTab === 'settings' ? 'active' : ''}`}>
                {/* Render SettingsTab, passing the session and refresh trigger */}
                <SettingsTab session={session} refreshTrigger={refreshCounter} />
              </div>

              <div id="analyticsTab" className={`tab-content ${activeTab === 'analytics' ? 'active' : ''}`}>
                {/* Pass counter as refreshTrigger prop */}
                <AnalyticsTab session={session} refreshTrigger={fixSavedCounter} />
              </div>

              <div id="feedbackTab" className={`tab-content ${activeTab === 'feedback' ? 'active' : ''}`}>
                <FeedbackTab />
              </div>

          </>
      )}
    </div>
  );
};

export default MainApp;
