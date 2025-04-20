import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface SettingsTabProps {
  session: Session;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // State for settings fields
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [defaultLLM, setDefaultLLM] = useState<string | null>(null);

  // Fetch current settings on mount
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('claude_api_key, gemini_api_key, default_llm')
          .eq('id', session.user.id)
          .single();

        if (fetchError) throw fetchError;

        if (data) {
          setClaudeApiKey(data.claude_api_key || '');
          setGeminiApiKey(data.gemini_api_key || '');
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

    // Basic validation: Ensure a default LLM is chosen if at least one key is present
    const hasClaudeKey = !!claudeApiKey;
    const hasGeminiKey = !!geminiApiKey;
    if ((hasClaudeKey || hasGeminiKey) && !defaultLLM) {
        setError('Please select a default LLM if you have provided API keys.');
        setLoading(false);
        return;
    }
    // Ensure default LLM corresponds to a provided key
    if ((defaultLLM === 'claude' && !hasClaudeKey) || (defaultLLM === 'gemini' && !hasGeminiKey)) {
        setError(`Cannot set default to ${defaultLLM} without providing the corresponding API key.`);
        setLoading(false);
        return;
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          claude_api_key: claudeApiKey || null,
          gemini_api_key: geminiApiKey || null,
          default_llm: defaultLLM,
          // Ensure onboarding_complete remains true or handle as needed
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      setSuccessMessage('Settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000); // Clear message after 3s

    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.error_description || err.message || 'Failed to save settings.');
    } finally {
      setLoading(false);
    }
  };

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
          <div className="form-group">
            <label htmlFor="claudeApiKey">Claude API Key</label>
            <input
              type="password"
              id="claudeApiKey"
              className="input"
              placeholder="sk-ant-api..."
              value={claudeApiKey}
              onChange={(e) => setClaudeApiKey(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="geminiApiKey">Gemini API Key</label>
            <input
              type="password"
              id="geminiApiKey"
              className="input"
              placeholder="AIzaSy..."
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Default LLM Selection */}
          <h3 style={{ marginTop: '20px' }}>Default LLM</h3>
          <div className="radio-group">
             {/* Only show options if key is potentially present (user might clear key) */}
            {(!!claudeApiKey || defaultLLM === 'claude') && (
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
            {(!!geminiApiKey || defaultLLM === 'gemini') && (
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
             {(!claudeApiKey && !geminiApiKey) && (
                 <p><small>Provide an API key above to select a default LLM.</small></p>
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