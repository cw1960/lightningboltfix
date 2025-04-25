import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface OnboardingFlowProps {
  session: Session;
  onOnboardingComplete: () => void;
}

// Define allowed provider types
type ProviderType = 'Anthropic' | 'Google' | 'OpenAI' | 'Azure OpenAI' | 'Meta' | 'DeepSeek' | 'Cohere' | 'Mistral' | 'Alibaba' | 'Other';
const providerTypes: ProviderType[] = ['Google', 'Anthropic', 'OpenAI', 'Meta', 'DeepSeek', 'Cohere', 'Mistral', 'Alibaba', 'Other'];

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ session, onOnboardingComplete }) => {
  // Step 1: Collect LLM Config, Step 2: Instructions
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for the single default LLM configuration
  // Default Model Name and Provider Type to Google Gemini Flash
  const [modelName, setModelName] = useState('Google Gemini 2.0 Flash (Free Tier)');
  const [providerType, setProviderType] = useState<ProviderType>('Google'); 
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState(''); // Optional endpoint

  // Determine if endpoint is required based on provider type
  const isEndpointRequired = providerType === 'Azure OpenAI' || providerType === 'Other';

  // Total steps reduced to 2 (LLM Config, Instructions)
  const totalSteps = 2;

  const nextStep = () => {
    if (currentStep < totalSteps) {
        // Validation for Step 1 (LLM Configuration)
        if (currentStep === 1) {
            if (!modelName || !providerType || !apiKey) {
                setError('Please fill in Model Name, select Provider Type, and provide the API Key.');
                return;
            }
            if (isEndpointRequired && !apiEndpoint) {
                setError('API Endpoint is required for Azure OpenAI and Other provider types.');
                return;
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
    // Final validation (redundant if nextStep validation works, but good practice)
     if (!modelName || !providerType || !apiKey || (isEndpointRequired && !apiEndpoint)) {
        setError('Please ensure all required fields are filled correctly.');
        setCurrentStep(1); // Go back to config step
        return;
     }

    setLoading(true);
    setError(null);
    try {
      // Insert the new LLM configuration
      const { error: insertError } = await supabase
        .from('llm_user_configurations')
        .insert({
          profile_id: session.user.id,
          provider_type: providerType,
          model_name: modelName,
          api_key: apiKey,
          api_endpoint: isEndpointRequired ? apiEndpoint : null, // Only save if required
          is_default: true // This first one is the default
        });

      if (insertError) throw insertError;

      // Update the profile to mark onboarding as complete
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          onboarding_complete: true,
          // We no longer store default_llm here directly
        })
        .eq('id', session.user.id);

        if (updateError) {
            // Attempt to roll back the LLM config insertion if profile update fails?
            // For simplicity now, just log and report the error.
            console.error('Failed to mark onboarding complete after saving LLM config:', updateError);
            throw new Error('Failed to finalize onboarding.');
        }

      // Call the callback to signal completion to App.tsx
      onOnboardingComplete();
      console.log("Onboarding finished, called onOnboardingComplete callback.");

    } catch (err: any) {
      console.error('Finish Onboarding Error:', err);
      // Check for unique constraint violation (duplicate model name for user)
      if (err.code === '23505') { // PostgreSQL unique violation code
        setError(`You already have a configuration named "${modelName}". Please choose a different name.`);
        setCurrentStep(1); // Go back to config step
      } else {
        setError(err.error_description || err.message || 'Failed to save onboarding data');
      }
    } finally {
      // Loading state is managed by App.tsx after callback
      // setLoading(false);
    }
  };

  // --- Render Logic ---
  const renderStepContent = () => {
    switch (currentStep) {
      case 1: // LLM Configuration
        return (
          <div className="box">
            <h2>Configure Your Default LLM</h2>
            <p>We STRONGLY recommend that you use Google Gemini 2.0 Flash (Free Tier), however, you may use any LLM model you wish by providing the details below. You may add other LLM models in the "Settings" tab later.</p>

            {/* Provider Type - Moved Up */}
            <div className="form-group">
                <label htmlFor="onboardingProviderType">Provider Type *</label>
                <select
                    id="onboardingProviderType"
                    className="input" // Use 'input' class for similar styling or create a 'select' class
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

            {/* Model Name - Moved Down */}
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
              {/* Suggestion for Google */}
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
              {/* Instructions specifically for Google */}
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
                    type="text" // Consider type="url" for basic browser validation
                    id="onboardingApiEndpoint"
                    className="input"
                    placeholder="Enter the full API endpoint URL"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    disabled={loading}
                    required={isEndpointRequired} // HTML5 validation
                />
                <p style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>
                    Required for Azure OpenAI and Other providers.
                </p>
                </div>
            )}

          </div>
        );
      case 2: // Instructions (Old Step 3 is now Step 2)
        return (
          <div className="box">
            <h2>How to Use Lightning Bolt Fix</h2>
            <ol style={{ paddingLeft: '20px', listStyle: 'decimal' }}>
              <li>Navigate to a Bolt.new project.</li>
              <li>When you encounter an error, click the Lightning Bolt Fix icon in your browser toolbar.</li>
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
       <img src="https://i.imgur.com/SZyvR08.png" alt="Lightning Bolt Fix Logo" style={{ width: '90px', height: '90px', display: 'block', margin: '0 auto 20px auto' }} />
      <h1>Welcome to Lightning Bolt Fix!</h1>
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
          className="button button-secondary" // Add appropriate classes
          onClick={prevStep}
          disabled={currentStep === 1 || loading}
        >
          Back
        </button>
        {currentStep < totalSteps ? (
          <button
            className="button button-primary" // Add appropriate classes
            onClick={nextStep}
            disabled={loading}
          >
            Next
          </button>
        ) : (
          <button
            className="button button-primary" // Add appropriate classes
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