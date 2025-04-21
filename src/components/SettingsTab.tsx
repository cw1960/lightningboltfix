import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface SettingsTabProps {
  session: Session;
}

// Define profile structure explicitly for clarity
interface ProfileSettings {
    claude_api_key: string | null;
    gemini_api_key: string | null;
    user_selected_modal_name: string | null; // <-- Typo in user prompt? Assuming 'model' not 'modal'
    user_selected_modal_api: string | null; // <-- Typo in user prompt? Assuming 'model' not 'modal'
    default_llm: string | null;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // State for settings fields
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [customModelName, setCustomModelName] = useState(''); // <-- New state
  const [customModelApiKey, setCustomModelApiKey] = useState(''); // <-- New state
  const [defaultLLM, setDefaultLLM] = useState<string | null>(null);

  // Fetch current settings on mount
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          // Select all relevant fields
          .select('claude_api_key, gemini_api_key, user_selected_modal_name, user_selected_modal_api, default_llm')
          .eq('id', session.user.id)
          .single<ProfileSettings>(); // Use interface type

        if (fetchError) throw fetchError;

        if (data) {
          setClaudeApiKey(data.claude_api_key || '');
          setGeminiApiKey(data.gemini_api_key || '');
          setCustomModelName(data.user_selected_modal_name || ''); // <-- Set state
          setCustomModelApiKey(data.user_selected_modal_api || ''); // <-- Set state
          setDefaultLLM(data.default_llm || null);
        }
      } catch (err: any) {
        console.error('Error fetching profile settings:', err);
        setError('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [session.user.id]);

  // Handle saving settings
  const handleSaveSettings = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    // --- Validation --- 
    const hasClaudeKey = !!claudeApiKey;
    const hasGeminiKey = !!geminiApiKey;
    const hasCustomDetails = !!(customModelName && customModelApiKey);

    // Check if any LLM option is available
    const canSelectDefault = hasClaudeKey || hasGeminiKey || hasCustomDetails;

    // Ensure a default LLM is chosen if at least one option is configured
    if (canSelectDefault && !defaultLLM) {
        setError('Please select a default LLM from the available options.');
        setLoading(false);
        return;
    }

    // Ensure selected default LLM corresponds to provided details
    let isDefaultValid = true;
    if (defaultLLM === 'claude' && !hasClaudeKey) isDefaultValid = false;
    else if (defaultLLM === 'gemini' && !hasGeminiKey) isDefaultValid = false;
    else if (defaultLLM === 'custom' && !hasCustomDetails) isDefaultValid = false;
    // Also handle case where defaultLLM is somehow set but no options are valid
    else if (defaultLLM && !canSelectDefault) isDefaultValid = false;
    
    if (!isDefaultValid && defaultLLM) { // Only error if a default *is* selected but it's invalid
        setError(`Cannot set default to '${defaultLLM}'. Please provide the corresponding API details or choose another default.`);
        setLoading(false);
        return;
    }
    // If no details are provided at all, defaultLLM should be null
    const finalDefaultLLM = canSelectDefault ? defaultLLM : null;

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          claude_api_key: claudeApiKey || null,
          gemini_api_key: geminiApiKey || null,
          user_selected_modal_name: customModelName || null, // <-- Save custom name
          user_selected_modal_api: customModelApiKey || null, // <-- Save custom API key
          default_llm: finalDefaultLLM, // Use validated/cleared default
          // Ensure onboarding_complete remains true or handle as needed
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;
      
      // Update local state for defaultLLM in case it was cleared by validation
      setDefaultLLM(finalDefaultLLM);

      setSuccessMessage('Settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000); // Clear message after 3s

    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.error_description || err.message || 'Failed to save settings.');
    } finally {
      setLoading(false);
    }
  };

  // --- Render Logic ---
  const canSelectDefault = !!claudeApiKey || !!geminiApiKey || !!(customModelName && customModelApiKey);
  const isCustomOptionAvailable = !!(customModelName && customModelApiKey);

  return (
    <div className="box">
      <h2>Settings</h2>

      {loading && <p><span className="loading"></span> Loading settings...</p>}
      {error && <p className="error">{error}</p>}
      {successMessage && <p className="success">{successMessage}</p>}

      {!loading && (
        <>
          {/* API Keys */}
          <h3>API Keys</h3>
          {/* Claude Key */}
          <div className="form-group">
            <label htmlFor="claudeApiKey">Claude API Key</label>
            <input
              type="password"
              id="claudeApiKey"
              className="input"
              placeholder="sk-ant-api... (Optional)"
              value={claudeApiKey}
              onChange={(e) => setClaudeApiKey(e.target.value)}
              disabled={loading}
            />
          </div>
          {/* Gemini Key */}
          <div className="form-group">
            <label htmlFor="geminiApiKey">Gemini API Key</label>
            <input
              type="password"
              id="geminiApiKey"
              className="input"
              placeholder="AIzaSy... (Optional)"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {/* Custom Model Details */}
          <div style={{ marginTop: '15px', borderTop: '1px solid #444', paddingTop: '10px' }}>
            <h4 style={{marginBottom: '10px'}}>Custom Model (Optional)</h4>
             <div className="form-group">
              <label htmlFor="customModelName">Custom Model Name</label>
              <input
                type="text"
                id="customModelName"
                className="input"
                placeholder="e.g., gpt-4o"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                disabled={loading}
              />
            </div>
             <div className="form-group">
              <label htmlFor="customModelApiKey">Custom Model API Key</label>
              <input
                type="password"
                id="customModelApiKey"
                className="input"
                placeholder="Enter API key"
                value={customModelApiKey}
                onChange={(e) => setCustomModelApiKey(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Default LLM Selection */}
          <h3 style={{ marginTop: '20px' }}>Default LLM</h3>
          <div className="radio-group">
            {/* Claude Option */}
            {claudeApiKey && (
                <div className="radio-option">
                    <input
                        type="radio"
                        id="defaultClaudeSettings"
                        name="defaultLLMSettings"
                        value="claude"
                        checked={defaultLLM === 'claude'}
                        onChange={() => setDefaultLLM('claude')}
                        disabled={loading}
                    />
                    <label htmlFor="defaultClaudeSettings">Claude</label>
                </div>
            )}
            {/* Gemini Option */}
            {geminiApiKey && (
                <div className="radio-option">
                    <input
                        type="radio"
                        id="defaultGeminiSettings"
                        name="defaultLLMSettings"
                        value="gemini"
                        checked={defaultLLM === 'gemini'}
                        onChange={() => setDefaultLLM('gemini')}
                        disabled={loading}
                    />
                    <label htmlFor="defaultGeminiSettings">Gemini</label>
                </div>
            )}
            {/* Custom Option - Enabled only if name and key provided */}
            {isCustomOptionAvailable && (
                 <div className="radio-option">
                    <input
                        type="radio"
                        id="defaultCustomSettings"
                        name="defaultLLMSettings"
                        value="custom"
                        checked={defaultLLM === 'custom'}
                        onChange={() => setDefaultLLM('custom')}
                        disabled={loading}
                    />
                    <label htmlFor="defaultCustomSettings">Custom ({customModelName || 'Unnamed'})</label>
                </div>
            )}
            {/* Message if no options are configured */}
             {!canSelectDefault && (
                 <p><small>Provide API details above for at least one LLM to select a default.</small></p>
             )}
          </div>

          {/* Save Button */}
          <button
            className="button"
            onClick={handleSaveSettings}
            disabled={loading}
            style={{ marginTop: '20px' }}
          >
            {loading ? <span className="loading"></span> : 'Save Settings'}
          </button>

          {/* Sign Out Button */}
          <div style={{marginTop: '30px', borderTop: '1px solid #444', paddingTop: '15px'}}>
              <button 
                  className="button"
                  style={{backgroundColor: '#a00'}} // Warning color
                  onClick={async () => {
                    setLoading(true);
                    await supabase.auth.signOut();
                    // App.tsx listener will handle session change
                    setLoading(false);
                  }}
                  disabled={loading}
              >
                  Sign Out
              </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsTab; 