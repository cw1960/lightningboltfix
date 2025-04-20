import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface OnboardingFlowProps {
  session: Session;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ session }) => {
  const [currentStep, setCurrentStep] = useState(1); // Start at API keys step
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for API keys
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  // We won't handle 'Other API' for now for simplicity, but structure is there
  // const [otherApiProvider, setOtherApiProvider] = useState('');
  // const [otherApiKey, setOtherApiKey] = useState('');

  // State for default LLM
  const [defaultLLM, setDefaultLLM] = useState<string | null>(null);
  const availableLLMs: string[] = [];
  if (claudeApiKey) availableLLMs.push('claude');
  if (geminiApiKey) availableLLMs.push('gemini');

  // Set default LLM automatically if only one key is provided, or on step change
  useEffect(() => {
    if (currentStep === 2) { // Only adjust default on the LLM selection step
        if (availableLLMs.length === 1) {
            setDefaultLLM(availableLLMs[0]);
        } else if (!availableLLMs.includes(defaultLLM ?? '')) {
            // Reset if current default is no longer valid
            setDefaultLLM(availableLLMs.length > 0 ? availableLLMs[0] : null);
        }
    }
  }, [claudeApiKey, geminiApiKey, currentStep, defaultLLM]); // Rerun when keys or step change


  const totalSteps = 3; // 1: API Keys, 2: Default LLM, 3: Instructions

  const nextStep = () => {
    if (currentStep < totalSteps) {
        // Validation for Step 1 (API Keys)
        if (currentStep === 1 && !claudeApiKey && !geminiApiKey) {
            setError('Please enter at least one API key (Claude or Gemini).');
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
        if (!defaultLLM || !availableLLMs.includes(defaultLLM)) {
            setError('Please select a valid default LLM based on the keys you provided.');
            setLoading(false);
            setCurrentStep(2); // Go back to LLM step
            return;
        }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          claude_api_key: claudeApiKey || null, // Store empty strings as null
          gemini_api_key: geminiApiKey || null, // Store empty strings as null
          default_llm: defaultLLM, // Store selected default LLM
          onboarding_complete: true,
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      // On success, App.tsx's listener will eventually detect the change
      // in `needsOnboarding` state via the profile check and switch views.
      // No need to force navigation here.

    } catch (err: any) {
      console.error('Finish Onboarding Error:', err);
      setError(err.error_description || err.message || 'Failed to save onboarding data');
    } finally {
      setLoading(false);
    }
  };

  // --- Render Logic ---
  const renderStepContent = () => {
    switch (currentStep) {
      case 1: // API Keys
        return (
          <div className="box">
            <h2>Add Your API Keys</h2>
            <p>To use Lightning Bolt Fix, you'll need <strong>at least one</strong> API key for the LLMs.</p>

            <div className="form-group">
              <label htmlFor="onboardingClaudeApiKey">Claude API Key</label>
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

            <div className="form-group">
              <label htmlFor="onboardingGeminiApiKey">Gemini API Key</label>
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
            {/* Other API Key fields omitted for simplicity */}
          </div>
        );
      case 2: // Set Default LLM
        return (
          <div className="box">
            <h2>Choose Default LLM</h2>
            <p>Select which available LLM you want to use by default:</p>

            {availableLLMs.length === 0 ? (
                <p className='error'>Please go back and provide at least one API key.</p>
            ) : (
                <div className="radio-group" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    {availableLLMs.includes('claude') && (
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
                        <label htmlFor="defaultClaude">Claude (Sonnet 3.5)</label> {/* Specify model potentially */}
                        </div>
                    )}
                    {availableLLMs.includes('gemini') && (
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
                        <label htmlFor="defaultGemini">Gemini (Pro 1.5)</label> {/* Specify model potentially */}
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
            <ol style={{ paddingLeft: '20px', lineHeight: '1.5' }}>
              <li>Navigate to a Bolt.new project</li>
              <li>When you encounter an error, click the Lightning Bolt Fix icon</li>
              <li>Paste the error message and problematic code</li>
              <li>Click "Fix Code" to get an AI-powered solution</li>
              <li>Apply the fix to your code</li>
            </ol>
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
            disabled={loading || (currentStep === 1 && !claudeApiKey && !geminiApiKey) || (currentStep === 2 && availableLLMs.length === 0)}
          >
            Next
          </button>
        ) : (
          <button
            className="button"
            onClick={handleFinishOnboarding}
            disabled={loading}
          >
            {loading ? <span className="loading"></span> : 'I Got It!'}
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingFlow; 