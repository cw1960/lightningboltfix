import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface OnboardingFlowProps {
  session: Session;
  onOnboardingComplete: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ session, onOnboardingComplete }) => {
  const [currentStep, setCurrentStep] = useState(1); // Start at API keys step
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for API keys
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [customModelApiKey, setCustomModelApiKey] = useState('');

  // State for default LLM
  const [defaultLLM, setDefaultLLM] = useState<string | null>(null);

  // Determine available LLM options based on provided inputs
  const getAvailableLLMOptions = () => {
    const options: string[] = [];
    if (claudeApiKey) options.push('claude');
    if (geminiApiKey) options.push('gemini');
    if (customModelName && customModelApiKey) options.push('custom');
    return options;
  };

  // Set default LLM automatically if only one key is provided, or on step change
  useEffect(() => {
    if (currentStep === 2) { // Only adjust default on the LLM selection step
        const availableOptions = getAvailableLLMOptions();
        if (availableOptions.length === 1) {
            setDefaultLLM(availableOptions[0]);
        } else if (!availableOptions.includes(defaultLLM ?? '')) {
            // Reset if current default is no longer valid or if null
            setDefaultLLM(availableOptions.length > 0 ? availableOptions[0] : null);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claudeApiKey, geminiApiKey, customModelName, customModelApiKey, currentStep]); // Rerun when keys or step change


  const totalSteps = 3; // 1: API Keys, 2: Default LLM, 3: Instructions

  const nextStep = () => {
    if (currentStep < totalSteps) {
        // Validation for Step 1 (API Keys)
        if (currentStep === 1 && !claudeApiKey && !geminiApiKey && !(customModelName && customModelApiKey)) {
            setError('Please provide API details for at least one LLM (Claude, Gemini, or Custom).');
            return;
        }
        setError(null); // Clear error on successful navigation
        setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null); // Clear error when going back
    }
  };

  const handleFinishOnboarding = async () => {
    setLoading(true);
    setError(null);
    try {
        // Validate Step 2 (Default LLM) before finishing
        let isValidDefault = false;
        if (defaultLLM === 'claude' && claudeApiKey) isValidDefault = true;
        else if (defaultLLM === 'gemini' && geminiApiKey) isValidDefault = true;
        else if (defaultLLM === 'custom' && customModelName && customModelApiKey) isValidDefault = true;

        if (!defaultLLM || !isValidDefault) {
            setError('Please select a valid default LLM based on the details you provided.');
            setLoading(false);
            setCurrentStep(2); // Go back to LLM step
            return;
        }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          claude_api_key: claudeApiKey || null, 
          gemini_api_key: geminiApiKey || null, 
          user_selected_modal_name: customModelName || null,
          user_selected_modal_api: customModelApiKey || null,
          default_llm: defaultLLM,
          onboarding_complete: true,
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      // Call the callback to signal completion to App.tsx
      onOnboardingComplete();
      console.log("Onboarding finished, called onOnboardingComplete callback.");

    } catch (err: any) {
      console.error('Finish Onboarding Error:', err);
      setError(err.error_description || err.message || 'Failed to save onboarding data');
    } finally {
      // Loading state is managed by App.tsx after callback
      // setLoading(false); 
    }
  };

  // --- Render Logic ---
  const renderStepContent = () => {
    const availableOptions = getAvailableLLMOptions();
    switch (currentStep) {
      case 1: // API Keys
        return (
          <div className="box">
            <h2>Add Your API Keys</h2>
            <p>Provide API details for <strong>at least one</strong> LLM service.</p>

            {/* Claude */}
            <div className="form-group">
              <label htmlFor="onboardingClaudeApiKey">Claude API Key (Anthropic)</label>
              <input
                type="password"
                id="onboardingClaudeApiKey"
                className="input"
                placeholder="sk-ant-api... (Optional)"
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Gemini */}
            <div className="form-group">
              <label htmlFor="onboardingGeminiApiKey">Gemini API Key (Google AI Studio)</label>
              <input
                type="password"
                id="onboardingGeminiApiKey"
                className="input"
                placeholder="AIzaSy... (Optional)"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Custom Model */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #444', paddingTop: '15px' }}>
                <p style={{ fontSize: '0.9em', color: '#ccc', marginBottom: '10px' }}>Alternatively, provide details for a different model:</p>
                <div className="form-group">
                <label htmlFor="onboardingCustomName">Custom Model Name</label>
                <input
                    type="text"
                    id="onboardingCustomName"
                    className="input"
                    placeholder="e.g., gpt-4o (Optional)"
                    value={customModelName}
                    onChange={(e) => setCustomModelName(e.target.value)}
                    disabled={loading}
                />
                </div>
                <div className="form-group">
                <label htmlFor="onboardingCustomApiKey">Custom Model API Key</label>
                <input
                    type="password"
                    id="onboardingCustomApiKey"
                    className="input"
                    placeholder="Enter API key (Optional)"
                    value={customModelApiKey}
                    onChange={(e) => setCustomModelApiKey(e.target.value)}
                    disabled={loading}
                />
                </div>
            </div>
          </div>
        );
      case 2: // Set Default LLM
        return (
          <div className="box">
            <h2>Choose Default LLM</h2>
            <p>Select which available LLM you want to use by default:</p>

            {availableOptions.length === 0 ? (
                <p className='error'>Please go back and provide API details for at least one LLM.</p>
            ) : (
                <div className="radio-group" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    {/* Claude Option */}
                    {claudeApiKey && (
                        <div className="radio-option">
                        <input
                            type="radio"
                            id="defaultClaude"
                            name="defaultLLM"
                            value="claude"
                            checked={defaultLLM === 'claude'}
                            onChange={() => setDefaultLLM('claude')}
                            disabled={loading}
                        />
                        <label htmlFor="defaultClaude">Claude (Sonnet 3.5)</label>
                        </div>
                    )}
                    {/* Gemini Option */}
                    {geminiApiKey && (
                        <div className="radio-option">
                        <input
                            type="radio"
                            id="defaultGemini"
                            name="defaultLLM"
                            value="gemini"
                            checked={defaultLLM === 'gemini'}
                            onChange={() => setDefaultLLM('gemini')}
                            disabled={loading}
                        />
                        <label htmlFor="defaultGemini">Gemini (Pro 1.5)</label>
                        </div>
                    )}
                    {/* Custom Option - Only show if name and key are provided */}
                    {(customModelName && customModelApiKey) && (
                        <div className="radio-option">
                        <input
                            type="radio"
                            id="defaultCustom"
                            name="defaultLLM"
                            value="custom"
                            checked={defaultLLM === 'custom'}
                            onChange={() => setDefaultLLM('custom')}
                            disabled={loading}
                        />
                        <label htmlFor="defaultCustom">Custom ({customModelName || 'Unnamed'})</label>
                        </div>
                    )}
                </div>
            )}
          </div>
        );
      case 3: // Instructions
        return (
          <div className="box">
            <h2>How to Use Lightning Bolt Fix</h2>
            <ol style={{ paddingLeft: '20px', listStyle: 'decimal' }}>
              <li>Navigate to a Bolt.new project.</li>
              <li>When you encounter an error, click the Lightning Bolt Fix icon in your browser toolbar.</li>
              <li>Use the "Pick Element" button to select the error message on the page, or paste it manually.</li>
              <li>Manually copy the full code from the relevant file and paste it into the 'Paste Entire Errant Code Here' box.</li>
              <li>Click "Fix Code" to get an AI-powered explanation and solution.</li>
              <li>Copy the fixed code and apply it to your project.</li>
            </ol>
            <p style={{ marginTop: '15px', fontStyle: 'italic' }}>Tip: Manage your API keys and default LLM in the Settings tab later.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="auth-container"> {/* Reusing auth-container style */}
      <div className="auth-header">
        <img
          src="https://i.imgur.com/twNKfqN.png"
          alt="Lightning Bolt Fix Logo"
          style={{
            width: '90px',
            height: '90px',
            display: 'block', // Center the image
            margin: '0 auto 16px auto' // Add bottom margin
          }}
        />
        <h1>Welcome!</h1>
        <p>Let's get you set up, {session.user.email}</p>
      </div>

      <div className="step-indicator">
        {[...Array(totalSteps)].map((_, i) => (
          <div key={i} className={`step-dot ${currentStep === i + 1 ? 'active' : ''}`}></div>
        ))}
      </div>

      {renderStepContent()}

      {error && <p className="error" style={{marginTop: '10px', textAlign: 'center'}}>{error}</p>}

      <div className="onboarding-buttons">
        <button
          className="button"
          onClick={prevStep}
          disabled={currentStep === 1 || loading}
          style={{ backgroundColor: currentStep === 1 ? '#555' : '#262626' }}
        >
          Back
        </button>
        {currentStep < totalSteps ? (
          <button
            className="button"
            onClick={nextStep}
            disabled={loading || (currentStep === 1 && !claudeApiKey && !geminiApiKey && !(customModelName && customModelApiKey)) || (currentStep === 2 && getAvailableLLMOptions().length === 0)}
          >
            Next
          </button>
        ) : (
          <button
            className="button"
            onClick={handleFinishOnboarding}
            disabled={loading || !defaultLLM}
          >
            {loading ? <span className="loading"></span> : 'I Got It!'}
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingFlow; 