import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';
// import ExtPay from 'extpay'; // <-- Comment out ExtPay import
import SettingsTab from './SettingsTab'; // Import SettingsTab
import AnalyticsTab from './AnalyticsTab'; // Import AnalyticsTab

// Initialize ExtPay - Use your Extension ID
// const extpay = ExtPay('lightning-bolt-fix'); // <-- Comment out ExtPay initialization

// Define structure for a single LLM configuration row
// Matches the llm_user_configurations table
interface LlmConfiguration {
    id: string; // UUID
    profile_id: string; // UUID
    provider_type: 'Anthropic' | 'Google' | 'OpenAI' | 'Azure OpenAI' | 'Custom';
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

  const FREE_FIX_LIMIT = 10;

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
    setErrorFixPlan(''); // <-- Clear plan state
    setIsPickingPlanElement(false); // <-- Clear plan picker state
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
    setLoading(true);
    setError(null);
    setFixedCode(null);
    setExplanation(null);

    let defaultLlmConfig: LlmConfiguration | null = null; // Store the fetched config

    try {
      // --- Payment & Free Fix Check (Keep this logic as is) --- 
      let canProceed = false;
      try {
        /* // Comment out ExtPay check Start
        const extUser = await extpay.getUser();
        if (extUser.paid) {
            console.log("User is paid. Proceeding with fix.");
            canProceed = true;
        } else {
        */ // Comment out ExtPay check End

            // --- Start: Assume user is NOT paid (Free Tier Logic) ---
            console.log("ExtPay Disabled: Assuming free tier. Checking free fixes...");
            // Fetch profile specifically for free fixes count
            const { data: freeFixProfile, error: freeFixError } = await supabase
              .from('profiles')
              .select('free_fixes_used') // Still need this from profiles
              .eq('id', session.user.id)
              .single<{ free_fixes_used: number }>();

            if (freeFixError) throw new Error("Could not verify free fix count.");
            
            const fixesUsed = freeFixProfile?.free_fixes_used ?? 0;
            console.log(`Free fixes used: ${fixesUsed} / ${FREE_FIX_LIMIT}`);

            if (fixesUsed < FREE_FIX_LIMIT) {
                console.log("Free fix available. Incrementing count...");
                const { error: rpcError } = await supabase.rpc('increment_free_fixes', { 
                    user_id_to_increment: session.user.id 
                });
                if (rpcError) {
                    console.error("Failed to increment free fix counter:", rpcError);
                    throw new Error("Failed to update free fix count. Please try again.");
                }
                console.log("Free fix count incremented. Proceeding with fix.");
                canProceed = true;
            } else {
                 throw new Error(`Free fix limit (${FREE_FIX_LIMIT}/${FREE_FIX_LIMIT}) reached. Please upgrade via the Settings tab.`);
            }
            // --- End: Assume user is NOT paid (Free Tier Logic) ---

        /* // Comment out ExtPay check Else block Start
        }
        */ // Comment out ExtPay check Else block End
      } catch (extPayCheckError: any) {
          console.error("Error during payment/free fix check:", extPayCheckError);
          throw extPayCheckError;
      }

      if (!canProceed) {
          throw new Error("Could not proceed with fix due to payment or free limit status.");
      }
      // --- End Payment & Free Fix Check ---

      // 1. Fetch the user's default LLM configuration
      const { data: configData, error: configError } = await supabase
        .from('llm_user_configurations')
        .select('*') // Select all columns from the config table
        .eq('profile_id', session.user.id)
        .eq('is_default', true)
        .limit(1) // Should only be one default
        .maybeSingle<LlmConfiguration>(); // Use maybeSingle in case no default is set

      if (configError) throw new Error(`Failed to fetch LLM configuration: ${configError.message}`);
      if (!configData) throw new Error('No default LLM configuration found. Please set one in Settings.');
      
      defaultLlmConfig = configData; // Assign to the outer scope variable

      // 2. Determine API details based on the provider type
      const llmProvider = defaultLlmConfig.provider_type;
      const llmModelName = defaultLlmConfig.model_name;
      const apiKey = defaultLlmConfig.api_key;
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
        'Your ONLY goal is to return the **COMPLETE, UNMODIFIED ORIGINAL CODE PLUS THE NECESSARY FIX** based on the Plan and Error Message. You MUST fix the errant code provided above, strictly following the Plan provided. Your response MUST strictly follow this format:\n\n' +
        '1.  **Explanation:**\n' +
        '    A concise explanation of the error and the fix applied (informed by the Plan).\n' +
        '    **CRITICAL VERIFICATION CONFIRMATION:** You MUST include the phrase "Verification complete: Full original code preserved." in this explanation section to confirm you have performed the check described below.\n\n' +
        '2.  **Fixed Code (COMPLETE and UNALTERED Original + Fix):**\n' +
        '    This section **MUST** contain the **ENTIRE, COMPLETE, UNALTERED ORIGINAL CODE PLUS THE FIX**. It is **NON-NEGOTIABLE** that you return the *full file content* as it needs to replace the original file directly. Any deviation will break the user\'s application.\n' +
        '    - **VERIFY:** Before outputting the code block, perform a mental line-by-line comparison between the original "Errant Code" input and your generated "Fixed Code" output. Ensure that *every single line* from the original code is present in the output, UNLESS it was explicitly modified as part of the fix according to the Plan. Confirm that you have NOT commented out any previously active code or added placeholders like `...` or `// existing code`. This verification is MANDATORY.\n' +
        '    - **ABSOLUTELY NO** returning only the changed snippet or function.\n' +
        '    - **ABSOLUTELY NO** omitting *any* part of the original code (imports, comments, functions, structure, whitespace etc.).\n' +
        '    - **ABSOLUTELY NO** using ellipses (`...`) or placeholders (e.g., `// ... rest of code ...`, `{/* ... */}`).\n' +
        '    - **ABSOLUTELY NO** summarizing, truncating, or commenting out existing, functional code.\n' +
        '    - **ONLY** modify the lines necessary to correct the error according to the Plan.\n' +
        '    - The code block below **MUST** represent the **COMPLETE AND RUNNABLE** file content.\n' +
        '    Enclose the **COMPLETE, ENTIRE, and VERIFIED** fixed code within a single markdown code block starting with ```language (e.g., ```javascript) and ending with ```.\n\n' +
        '## FINAL CHECK & CONSEQUENCE ##\n' +
        'Failure to provide the COMPLETE and UNALTERED original code (plus the fix) in the specified format, OR failure to include the verification confirmation phrase in the explanation, will render the output useless and break the application. Return ONLY the explanation (including the confirmation phrase) and the **COMPLETE** fixed code block.\n';

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
             // Assuming Gemini 1.5 Pro - make configurable later?
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
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
        case 'Custom':
            if (!defaultLlmConfig.api_endpoint) {
                throw new Error('API Endpoint is missing for Custom configuration.');
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
             console.log(`Using Custom provider: ${llmModelName} at ${apiUrl}`);
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
        } else if (llmProvider === 'OpenAI' || llmProvider === 'Azure OpenAI' || llmProvider === 'Custom') {
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
        console.error('Failed to save fix details:', saveError);
        // Display the actual error message from Supabase
        const detailedMessage = saveError.message || 'Unknown database error during history save';
        setError(`Code fixed, but failed to save history: ${detailedMessage}`);
      } else {
          // Increment counter to trigger potential refresh in Analytics
          setFixSavedCounter(prev => prev + 1); 
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
    }).catch(err => {
      // Failure
      console.error('Failed to copy code:', err);
      setCopyButtonText('Copy Failed');
      // Optionally display a more prominent error to the user
      setError('Failed to copy code to clipboard.'); // Use existing error state
      setTimeout(() => setCopyButtonText('Copy Fixed Code'), 3000); // Reset later on failure
    });
  };
  // --- Copy Handler --- END

  // --- Render Logic ---
  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <div className="logo">
          {/* Replace existing SVG/H1 with the image */}
          <img 
            src="https://i.imgur.com/twNKfqN.png"
            alt="Lightning Bolt Fix Logo"
            style={{ width: '90px', height: '90px' }} // Apply size
          />
        </div>
        {/* Consider moving Fix New Error button inside the Fix tab later */}
        <button
          className="button"
          onClick={handleReset}
          style={{
            // Change background to green if fix is complete and no error/loading
            backgroundColor: (fixedCode && !loading && !error) ? '#28a745' : '#555',
          }}
        >
          Fix New Error
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="tabs">
        <div 
          className={`tab ${activeTab === 'fix' ? 'active' : ''}`}
          onClick={() => setActiveTab('fix')}
        >
          Fix Code
        </div>
        <div 
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </div>
        <div 
          className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </div>
      </div>

      {/* Tab Content */} 
      <div id="fixTab" className={`tab-content ${activeTab === 'fix' ? 'active' : ''}`}> 
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
            <label htmlFor="errantCodeInput" style={{ marginBottom: 0 }}>Errant Code Schema</label>
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
          <button  
            className="button"  
            onClick={handleFixCode}  
            disabled={loading || !errorMessage || !errantCode} 
          > 
            {loading ? <span className="loading"></span> : 'Fix Code'} 
          </button>  
        </div> 
 
        {/* Display Loading or Error */} 
        {loading && <div className="box"><span className="loading"></span> Processing...</div>} 
        {error && !loading && ( 
          <div className="box error" style={{ border: '1px solid #ef4444', background: '#444' }}> 
            <p style={{ fontWeight: 'bold' }}>Error:</p> 
            <p style={{ whiteSpace: 'pre-wrap' }}>{error}</p> 
          </div> 
        )} 
 
        {/* Results Area */} 
        {!loading && !error && (explanation || fixedCode) && ( 
          <div className="box"> 
            {explanation && ( 
              <div> 
                <h2>Explanation</h2> 
                <p style={{ whiteSpace: 'pre-wrap' }}>{explanation}</p> 
              </div> 
            )} 
            {fixedCode && ( 
              <div style={{ marginTop: explanation ? '16px' : '0' }}> 
                {/* Flex container for Title and Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h2>Fixed Code</h2> 
                  <button  
                    className="button"  
                    style={{ padding: '4px 8px', fontSize: '0.8em'}} // Smaller button, adjust as needed
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
        {/* Render SettingsTab, passing the session */}
        <SettingsTab session={session} />
      </div>

      <div id="analyticsTab" className={`tab-content ${activeTab === 'analytics' ? 'active' : ''}`}>
        {/* Pass counter as refreshTrigger prop */}
        <AnalyticsTab session={session} refreshTrigger={fixSavedCounter} />
      </div>

    </div>
  );
};

export default MainApp;
