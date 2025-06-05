import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface OnboardingFlowProps {
  session: Session;
  onOnboardingComplete: () => void;
}

// Define allowed provider types
type ProviderType = 'Anthropic' | 'Google' | 'OpenAI' | 'Azure OpenAI' | 'Meta' | 'DeepSeek' | 'Cohere' | 'Mistral' | 'Alibaba' | 'Other';
const providerTypes: ProviderType[] = ['Google', 'Anthropic', 'OpenAI', 'Meta', 'DeepSeek', 'Cohere', 'Mistral', 'Alibaba', 'Other'];

const YOUTUBE_URL = 'https://youtu.be/zWlzxSXmpxY'; // Replace with actual URL

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ session, onOnboardingComplete }) => {
  // Step 1: Collect LLM Config, Step 2: Instructions
  const [currentStep, setCurrentStep] = useState(() => {
    // Try to restore step from localStorage
    const savedStep = localStorage.getItem('onboarding_step');
    return savedStep ? parseInt(savedStep, 10) : 1;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for the single default LLM configuration with localStorage persistence
  const [modelName, setModelName] = useState(() => {
    return localStorage.getItem('onboarding_model_name') || 'Google Gemini 2.0 Flash (Free Tier)';
  });
  const [providerType, setProviderType] = useState<ProviderType>(() => {
    return (localStorage.getItem('onboarding_provider_type') as ProviderType) || 'Google';
  });
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('onboarding_api_key') || '';
  });
  const [apiEndpoint, setApiEndpoint] = useState(() => {
    return localStorage.getItem('onboarding_api_endpoint') || '';
  });
  const [useBuiltinKeys, setUseBuiltinKeys] = useState(() => providerType === 'Google');
  const [showCustomLlm, setShowCustomLlm] = useState(false);

  // Effect to save form data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('onboarding_step', currentStep.toString());
    localStorage.setItem('onboarding_model_name', modelName);
    localStorage.setItem('onboarding_provider_type', providerType);
    localStorage.setItem('onboarding_api_key', apiKey);
    localStorage.setItem('onboarding_api_endpoint', apiEndpoint);
  }, [currentStep, modelName, providerType, apiKey, apiEndpoint]);

  // Effect to update useBuiltinKeys default if providerType changes
  useEffect(() => {
    if (providerType === 'Google') setUseBuiltinKeys(true);
    else setUseBuiltinKeys(false);
  }, [providerType]);

  // Determine if endpoint is required based on provider type
  const isEndpointRequired = providerType === 'Azure OpenAI' || providerType === 'Other';

  // Total steps reduced to 2 (LLM Config, Instructions)
  const totalSteps = 2;

  const nextStep = () => {
    if (currentStep < totalSteps) {
        // Validation for Step 1 (LLM Configuration)
        if (currentStep === 1) {
            // Only validate fields if user is configuring their own LLM
            if (showCustomLlm) {
                if (!modelName || !providerType || !apiKey) {
                    setError('Please fill in Model Name, select Provider Type, and provide the API Key.');
                    return;
                }
                if (isEndpointRequired && !apiEndpoint) {
                    setError('API Endpoint is required for Azure OpenAI and Other provider types.');
                    return;
                }
            }
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
    // Validation: Only require LLM fields if showCustomLlm is true
    if (showCustomLlm) {
      if (!modelName || !providerType || !apiKey || (isEndpointRequired && !apiEndpoint)) {
        setError('Please ensure all required fields are filled correctly.');
        setCurrentStep(1);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      // Insert the new LLM configuration only if custom is enabled
      if (showCustomLlm) {
        const { error: insertError } = await supabase
          .from('llm_user_configurations')
          .insert({
            profile_id: session.user.id,
            provider_type: providerType,
            model_name: modelName,
            api_key: apiKey,
            api_endpoint: isEndpointRequired ? apiEndpoint : null,
            is_default: true
          });
        if (insertError) throw insertError;
      }
      // Update the profile to mark onboarding as complete and set use_builtin_keys
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          onboarding_complete: true,
          use_builtin_keys: !showCustomLlm && useBuiltinKeys
        })
        .eq('id', session.user.id);
      if (updateError) {
        console.error('Failed to mark onboarding complete after saving LLM config:', updateError);
        throw new Error('Failed to finalize onboarding.');
      }
      // Clear localStorage after successful onboarding
      localStorage.removeItem('onboarding_step');
      localStorage.removeItem('onboarding_model_name');
      localStorage.removeItem('onboarding_provider_type');
      localStorage.removeItem('onboarding_api_key');
      localStorage.removeItem('onboarding_api_endpoint');
      onOnboardingComplete();
      console.log("Onboarding finished, called onOnboardingComplete callback.");
    } catch (err: any) {
      console.error('Finish Onboarding Error:', err);
      if (err.code === '23505') {
        setError(`You already have a configuration named "${modelName}". Please choose a different name.`);
        setCurrentStep(1);
      } else {
        setError(err.error_description || err.message || 'Failed to save onboarding data');
      }
    } finally {
      // Loading state is managed by App.tsx after callback
    }
  };

  // Function to open video in a new window
  const openVideoInNewWindow = (e: React.MouseEvent) => {
    e.preventDefault();
    const videoWindow = window.open(YOUTUBE_URL, '_blank', 'noopener,noreferrer');
    if (videoWindow) videoWindow.focus();
  };

  // --- Render Logic ---
  const renderStepContent = () => {
    switch (currentStep) {
      case 1: // LLM Configuration
        return (
          <div className="box">
            <h2>Configure Your Default LLM</h2>
            <p>
              We STRONGLY recommend that you use the default LLM model that we have already checked for you below (see the pink checkbox).  However, if you wish to use your own LLM model and your own API key, you may do so by clicking on the "Configure My Own LLM" checkbox and providing the requested information.
            </p>
            {/* Pink Built-in API Key Checkbox (always visible, at the top) */}
            <div className="form-group" style={{ marginTop: '10px', marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={useBuiltinKeys}
                  onChange={() => setUseBuiltinKeys(v => !v)}
                  disabled={showCustomLlm || loading}
                  style={{ accentColor: '#eb4798', width: 18, height: 18 }}
                />
                Use Built-in API Keys (Recommended for Free Users)
              </label>
              <div style={{ fontSize: '0.85em', color: '#aaa', marginLeft: 26 }}>
                When enabled, the extension will use a built-in API key. You do NOT need to provide your own key.
              </div>
            </div>
            {/* Configure My Own LLM Checkbox */}
            <div className="form-group" style={{ marginTop: '10px', marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={showCustomLlm}
                  onChange={() => setShowCustomLlm(v => !v)}
                  disabled={loading}
                  style={{ accentColor: '#60a5fa', width: 18, height: 18 }}
                />
                Configure My Own LLM
              </label>
              <div style={{ fontSize: '0.85em', color: '#aaa', marginLeft: 26 }}>
                If you wish to use your own LLM model and API key, check this box and fill out the details below.
              </div>
            </div>
            {/* Accordion for custom LLM fields */}
            {showCustomLlm && (
              <div style={{ border: '1px solid #444', borderRadius: '6px', padding: '16px', marginTop: '10px', background: '#23272f' }}>
                {/* Provider Type */}
                <div className="form-group">
                  <label htmlFor="onboardingProviderType">Provider Type *</label>
                  <select
                    id="onboardingProviderType"
                    className="input"
                    value={providerType}
                    onChange={(e) => setProviderType(e.target.value as ProviderType)}
                    disabled={loading}
                    required
                  >
                    {providerTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                {/* Model Name */}
                <div className="form-group">
                  <label htmlFor="onboardingModelName">Model Name *</label>
                  <input
                    type="text"
                    id="onboardingModelName"
                    className="input"
                    placeholder={providerType === 'Google' ? "Defaults to Gemini 2.0 Flash" : "e.g., My Claude Sonnet"}
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    disabled={loading}
                    required
                  />
                  {providerType === 'Google' && !modelName && (
                    <p style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>
                      We recommend keeping the default name or similar for clarity.
                    </p>
                  )}
                </div>
                {/* API Key */}
                <div className="form-group">
                  <label htmlFor="onboardingApiKey">API Key *</label>
                  <input
                    type="password"
                    id="onboardingApiKey"
                    className="input"
                    placeholder={providerType === 'Google' ? "Paste your Google AI Studio key here" : "sk-... or AIzaSy... etc."}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={loading}
                    required
                  />
                  {providerType === 'Google' && (
                    <p style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>
                      Get your free API key from Google API Studio. This allows the extension to use the free Gemini 2.0 Flash LLM. If you need help on how to get this API, please visit <a href="https://lightningboltfix.com/get-gemini-key" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>https://lightningboltfix.com/get-gemini-key</a>
                    </p>
                  )}
                </div>
                {/* API Endpoint (Conditional) */}
                {isEndpointRequired && (
                  <div className="form-group">
                    <label htmlFor="onboardingApiEndpoint">API Endpoint *</label>
                    <input
                      type="text"
                      id="onboardingApiEndpoint"
                      className="input"
                      placeholder="Enter the full API endpoint URL"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      disabled={loading}
                      required={isEndpointRequired}
                    />
                    <p style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>
                      Required for Azure OpenAI and Other providers.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 2: // Instructions (Old Step 3 is now Step 2)
        return (
          <div className="box">
            <h2>How to Use Lightning Bolt Fix V3</h2>
            {/* Demo Video Button (only in Step 2) */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <button
                className="button"
                style={{ marginTop: 8 }}
                onClick={openVideoInNewWindow}
              >
                Watch Demo Video
              </button>
            </div>
            <ol style={{ paddingLeft: '20px', listStyle: 'decimal' }}>
              <li>Navigate to a Bolt.new project.</li>
              <li>When you encounter an error, click the Lightning Bolt Fix V3 icon in your browser toolbar.</li>
              {/*<li>Use the \"Pick Element\" button to select the error message on the page, or paste it manually.</li>*/}
              <li>Select text containing the error message on the page.</li>
              <li>Click the "Capture Selection" button in the side panel.</li>
              <li>Manually copy the full code from the relevant file and paste it into the 'Errant Code Schema' box.</li>
              <li>Click "Fix Code" to get an AI-powered explanation and solution using your configured default LLM.</li>
              <li>Copy the fixed code and apply it to your project.</li>
            </ol>
            <p style={{ marginTop: '15px', fontSize: '0.9em' }}>
              You can add more LLM configurations and change your default in the Settings tab later.
            </p>
          </div>
        );
      default:
        return <div>Unknown step</div>;
    }
  };

  return (
    <div className="onboarding-container">
       <img src="icons/icon128.png" alt="Lightning Bolt Fix V3 Logo" style={{ width: '90px', height: '90px', display: 'block', margin: '0 auto 20px auto' }} />
      <h1>Welcome to Lightning Bolt Fix V3!</h1>
      <p>Let's get you set up.</p>

      {/* Step Indicator */}
      <div className="step-indicator" style={{ margin: '20px 0', textAlign: 'center' }}>
        Step {currentStep} of {totalSteps}
      </div>

      {/* Render current step content */}
      {renderStepContent()}

      {/* Error Display */}
      {error && <p className="error-message" style={{ color: 'red', marginTop: '15px', textAlign: 'center' }}>{error}</p>}

      {/* Navigation Buttons */}
      <div className="navigation-buttons" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button
          className="button button-secondary"
          onClick={prevStep}
          disabled={currentStep === 1 || loading}
        >
          Back
        </button>
        {currentStep < totalSteps ? (
          <button
            className="button button-primary"
            onClick={nextStep}
            disabled={loading}
          >
            Next
          </button>
        ) : (
          <button
            className="button button-primary"
            onClick={handleFinishOnboarding}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Finish Setup'}
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingFlow; 