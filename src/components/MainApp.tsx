import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';
import SettingsTab from './SettingsTab'; // Import SettingsTab
import AnalyticsTab from './AnalyticsTab'; // Import AnalyticsTab

// Define expected structure for profile data
interface ProfileData {
    claude_api_key: string | null;
    gemini_api_key: string | null;
    default_llm: string | null;
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

  // --- Message Listener Effect ---
  useEffect(() => {
    // Keep the listener simple, only log if needed for future debugging
    const messageListener = (message: any, sender: chrome.runtime.MessageSender, _sendResponse: (response?: any) => void) => {
      console.log("MainApp received message (type check removed):", message, "from:", sender);
      // We removed the automatic state update based on type for now
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // --- Reset Handler ---
  const handleReset = () => {
    setErrorMessage('');
    setErrantCode('');
    setFixedCode(null);
    setExplanation(null);
    setError(null);
    setLoading(false);
    setCopyButtonText('Copy Fixed Code'); 
    console.log('State reset for new error.');
  };

  // --- Handle Fix Code Logic ---
  const handleFixCode = async () => {
    setLoading(true);
    setError(null);
    setFixedCode(null);
    setExplanation(null);
    // setOriginalCodeForDiff(errantCode); // Uncomment when adding diff viewer

    let llmProvider = ''; // Keep track for saving later

    try {
      // 1. Fetch user profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('claude_api_key, gemini_api_key, default_llm')
        .eq('id', session.user.id)
        .single<ProfileData>();

      if (profileError) throw new Error(`Failed to fetch profile: ${profileError.message}`);
      if (!profile) throw new Error('User profile not found.');

      // 2. Determine LLM and API details
      const llmToUse = profile.default_llm;
      llmProvider = llmToUse ?? ''; // Store the provider name
      let apiKey: string | null = null;
      let apiUrl: string = '';
      let requestBody: any = {};
      let headers: HeadersInit = { 'Content-Type': 'application/json' };

      // Construct the shared prompt content
      const promptContent = `Error Message: ${errorMessage}\n\nErrant Code:\n\`\`\`\n${errantCode}\n\`\`\`\n\nFix the errant code. Provide your response in two parts: First, an explanation of the error and the fix. Second, the complete fixed code block enclosed in \`\`\`language\n...\n\`\`\` markers.`;

      if (llmToUse === 'claude' && profile.claude_api_key) {
        apiKey = profile.claude_api_key;
        apiUrl = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
        requestBody = {
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 2048,
          messages: [{ role: "user", content: promptContent }]
        };
      } else if (llmToUse === 'gemini' && profile.gemini_api_key) {
        apiKey = profile.gemini_api_key;
        // Note: Key should be passed securely, but following previous plan for V1
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
        requestBody = {
          contents: [{ parts: [{ text: promptContent }] }]
        };
        // No extra headers needed for Gemini REST API with key in URL
      } else {
        throw new Error('Default LLM not set, API key missing, or provider not supported.');
      }

      // 3. Make the API call
      console.log(`Calling ${llmToUse} API`);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const result = await response.json();
      console.log(`${llmToUse} API Result:`, result);

      // 4. Parse the LLM response
      let explanationText = 'Could not parse explanation.';
      let fixedCodeBlock = 'Could not parse fixed code.';

      try { // Add try-catch for parsing, as LLM output can vary
          if (llmToUse === 'claude' && result.content?.[0]?.text) {
            const rawText = result.content[0].text;
            const codeBlockMatch = rawText.match(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/);
            if (codeBlockMatch?.[1]) {
              fixedCodeBlock = codeBlockMatch[1].trim();
              explanationText = rawText.substring(0, codeBlockMatch.index ?? 0).trim();
            } else {
              explanationText = rawText; // Assume whole response is explanation
            }
          } else if (llmToUse === 'gemini' && result.candidates?.[0]?.content?.parts?.[0]?.text) {
            const rawText = result.candidates[0].content.parts[0].text;
            const codeBlockMatch = rawText.match(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/);
            if (codeBlockMatch?.[1]) {
              fixedCodeBlock = codeBlockMatch[1].trim();
              explanationText = rawText.substring(0, codeBlockMatch.index ?? 0).trim();
            } else {
              explanationText = rawText; // Assume whole response is explanation
            }
          }
      } catch (parseError: any) {
          console.error("Error parsing LLM response:", parseError);
          setError(`Failed to parse LLM response: ${parseError.message}`);
          // Keep the default placeholder messages for explanation/code
      }

      setExplanation(explanationText);
      setFixedCode(fixedCodeBlock);

      // 5. Save fix details (Step 12)
       try {
            const { error: insertError } = await supabase.from('fixes').insert({
                user_id: session.user.id,
                error_message: errorMessage,
                errant_code: errantCode, // Store original code
                fixed_code: fixedCodeBlock,
                llm_explanation: explanationText,
                llm_provider: llmProvider,
                // file_path: null // Add later if file path parsing implemented
            });
            if (insertError) {
                console.error("Error saving fix to database:", insertError);
            } else {
                console.log("Fix details saved to database.");
                setFixSavedCounter(prev => prev + 1); // <-- Increment counter on success
            }
       } catch (dbError: any) {
            console.error("Error during database insert:", dbError);
       }


    } catch (err: any) {
      console.error('handleFixCode Error:', err);
      setError(err.message || 'An unknown error occurred.');
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
        <button className="button" onClick={handleReset} style={{ backgroundColor: '#555' }}>
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
          <label htmlFor="errorMessageInput">Error Message / File Path</label> 
          <input 
            id="errorMessageInput" 
            className="input" // Remove conditional class 
            value={errorMessage} 
            onChange={(e) => setErrorMessage(e.target.value)} // Revert to simple handler
            placeholder="Paste error message here..." // Simple placeholder
            disabled={loading} 
          /> 
        </div> 
 
        {/* Errant Code Input Area */} 
        <div className="box form-group"> 
          <label htmlFor="errantCodeInput">Paste Entire Errant Code Here</label> 
          <textarea 
            id="errantCodeInput" 
            className="textarea"  
            value={errantCode}  
            onChange={(e) => setErrantCode(e.target.value)}  
            placeholder="Paste the full code from the file indicated..." 
            rows={10} 
            disabled={loading} 
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
                <h2>Fixed Code</h2> 
                <pre className='result-code' style={{ whiteSpace: 'pre-wrap', background: '#1a1a1a', padding: '10px', borderRadius: '4px' }}>{fixedCode}</pre> 
                <button  
                  className="button"  
                  style={{ marginTop: '10px' }}  
                  onClick={handleCopyCode} 
                > 
                  {copyButtonText} 
                </button> 
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
