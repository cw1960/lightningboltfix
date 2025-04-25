import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';
// import ExtPay from 'extpay'; // Comment out ExtPay import

// Import or define the LlmConfiguration interface (make sure it matches MainApp)
interface LlmConfiguration {
    id: string;
    profile_id: string;
    provider_type: 'Anthropic' | 'Google' | 'OpenAI' | 'Azure OpenAI' | 'Custom';
    model_name: string;
    api_key: string;
    api_endpoint: string | null;
    is_default: boolean;
    created_at: string;
}

// Define allowed provider types (duplicate from Onboarding, consider sharing later)
type ProviderType = LlmConfiguration['provider_type'];
const providerTypes: ProviderType[] = ['Anthropic', 'Google', 'OpenAI', 'Azure OpenAI', 'Custom'];

// Initialize ExtPay - Use your Extension ID
// const extpay = ExtPay('lightning-bolt-fix'); // Comment out ExtPay initialization

interface SettingsTabProps {
  session: Session;
}

/* // Remove unused ExtPayUser interface
// Define ExtPay user structure (simplified based on docs)
interface ExtPayUser {
    paid: boolean;
    email: string | null;
    // Add other fields if needed (trialStartedAt, etc.)
}
*/

const SettingsTab: React.FC<SettingsTabProps> = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // State for LLM configurations
  const [configurations, setConfigurations] = useState<LlmConfiguration[]>([]);
  
  // State for ExtPay status
  // const [extPayUser, setExtPayUser] = useState<ExtPayUser | null>(null); // Comment out ExtPay user state
  const [isPaidUser, setIsPaidUser] = useState(false); // Use a simpler boolean state for paid status
  const [userEmail, setUserEmail] = useState<string | null>(null); // Store email separately if needed
  
  // State for managing the Add/Edit form/modal
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<LlmConfiguration | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  
  // State specifically for the form inputs
  const [formModelName, setFormModelName] = useState('');
  const [formProviderType, setFormProviderType] = useState<ProviderType>('Anthropic');
  const [formApiKey, setFormApiKey] = useState('');
  const [formApiEndpoint, setFormApiEndpoint] = useState('');
  const [formIsSaving, setFormIsSaving] = useState(false); // Loading state for form save

  const MAX_CONFIGURATIONS = 5;

  // --- Sign Out Handler ---
  const handleSignOut = async () => {
    setError(null); // Clear previous errors
    setLoading(true); // Indicate activity
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
      // No need to set state here, App.tsx listener will handle it
      console.log("User signed out successfully.");
    } catch (err: any) {
      console.error('Sign out error:', err);
      setError(err.message || 'Failed to sign out.');
      setLoading(false); // Reset loading state on error
    }
    // setLoading(false) is not needed on success because the component will unmount/change
  };

  // Fetch LLM configurations and ExtPay status
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch LLM Configurations
      const { data: configData, error: configError } = await supabase
        .from('llm_user_configurations')
        .select('*')
        .eq('profile_id', session.user.id)
        .order('created_at', { ascending: true }); // Order consistently

      if (configError) throw new Error(`Failed to load LLM configurations: ${configError.message}`);
      setConfigurations(configData || []);

      // Fetch ExtPay User Status
      /* // Comment out ExtPay fetch block Start
      try {
          const user = await extpay.getUser();
          console.log("ExtPay User:", user);
          setExtPayUser(user);
      } catch (extPayError: any) {
          console.error("Error fetching ExtPay user:", extPayError);
          setError("Could not retrieve payment status. Please try again later.");
          setExtPayUser({ paid: false, email: null }); // Assume unpaid on error
      }
      */ // Comment out ExtPay fetch block End

      // --- Mock ExtPay Status --- Start
      console.log("ExtPay Disabled: Assuming free user for settings display.");
      setIsPaidUser(false); // Assume free tier
      setUserEmail(session.user.email ?? null); // Get email from session, fallback to null
      // --- Mock ExtPay Status --- End

    } catch (err: any) {
      console.error('Error fetching settings data:', err);
      setError(err.message || 'Failed to load settings data.');
      setConfigurations([]); // Ensure empty array on error
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id]); // Depend only on user ID

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Open Form Handlers ---
  const handleAddClick = () => {
    if (configurations.length >= MAX_CONFIGURATIONS) {
        setError(`You can add a maximum of ${MAX_CONFIGURATIONS} configurations.`);
        return;
    }
    setEditingConfig(null); // Add mode
    // Reset form fields for adding
    setFormModelName('');
    setFormProviderType('Anthropic'); 
    setFormApiKey('');
    setFormApiEndpoint('');
    setShowForm(true);
    setFormError(null);
    setError(null); // Clear main error
  };

  const handleEditClick = (config: LlmConfiguration) => {
    setEditingConfig(config); // Edit mode
    // Pre-fill form fields for editing
    setFormModelName(config.model_name);
    setFormProviderType(config.provider_type);
    setFormApiKey(config.api_key); // Be cautious about displaying/re-saving keys
    setFormApiEndpoint(config.api_endpoint || '');
    setShowForm(true);
    setFormError(null);
    setError(null); // Clear main error
  };

  // --- Form Save/Update/Close Logic ---
  const handleSaveForm = async () => {
    setFormIsSaving(true);
    setFormError(null);
    setError(null);
    setSuccessMessage(null);

    const isEndpointNowRequired = formProviderType === 'Azure OpenAI' || formProviderType === 'Custom';

    // --- Validation ---
    if (!formModelName.trim()) {
        setFormError('Model Name is required.');
        setFormIsSaving(false);
        return;
    }
    // Check for duplicate model name (only when adding, or when editing AND name changed)
    const isNameUnique = !configurations.some(cfg => 
        cfg.model_name.toLowerCase() === formModelName.trim().toLowerCase() && 
        (!editingConfig || cfg.id !== editingConfig.id) // Ignore self when editing
    );
    if (!isNameUnique) {
        setFormError(`A configuration named "${formModelName.trim()}" already exists.`);
        setFormIsSaving(false);
        return;
    }

    if (!formApiKey.trim()) {
        setFormError('API Key is required.');
        setFormIsSaving(false);
        return;
    }
    if (isEndpointNowRequired && !formApiEndpoint.trim()) {
        setFormError('API Endpoint is required for Azure OpenAI and Custom providers.');
        setFormIsSaving(false);
        return;
    }
    // Basic URL validation for endpoint if provided/required
    if (formApiEndpoint.trim()) {
        try {
            new URL(formApiEndpoint.trim());
        } catch (_) {
            setFormError('Invalid API Endpoint URL format.');
            setFormIsSaving(false);
            return;
        }
    }
    // --- End Validation ---
    
    // Data to be saved/updated
    const configData: Partial<LlmConfiguration> & { profile_id: string } = {
        profile_id: session.user.id,
        provider_type: formProviderType,
        model_name: formModelName.trim(),
        api_endpoint: isEndpointNowRequired ? formApiEndpoint.trim() : null,
    };

    // Only include api_key in the update/insert if it's not blank
    // This prevents overwriting an existing key with blank when editing
    if (formApiKey.trim()) {
        configData.api_key = formApiKey.trim();
    }

    try {
        let dbError: any = null;
        if (editingConfig) {
            // --- Update Existing --- 
            // Ensure api_key is not set to null if formApiKey was blank
            if (!configData.api_key) {
                delete configData.api_key; // Don't update the key if input was blank
            }
            console.log("Updating config:", editingConfig.id, "with data:", configData);
            const { error } = await supabase
                .from('llm_user_configurations')
                .update(configData) // Pass the potentially modified configData
                .eq('id', editingConfig.id);
            dbError = error;
            if (!dbError) setSuccessMessage('Configuration updated successfully.');

        } else {
            // --- Insert New --- 
            // For insert, api_key is required from validation, so configData will have it
            console.log("Inserting new config with data:", configData);
             const { error } = await supabase
                .from('llm_user_configurations')
                .insert({
                     ...(configData as Omit<LlmConfiguration, 'id' | 'created_at' | 'is_default'>), // Type assertion needed
                     is_default: configurations.length === 0 // Make first added config the default
                 });
             dbError = error;
             if (!dbError) setSuccessMessage('Configuration added successfully.');
        }

        if (dbError) {
            // Handle specific errors if needed (like unique constraint)
            throw dbError;
        } else {
           setTimeout(() => setSuccessMessage(null), 3000);
           await fetchData(); // Refresh the list
           handleCloseForm(); // Close the form on success
        }

    } catch (err: any) {
        console.error('Error saving configuration:', err);
         // Check for unique constraint violation again (just in case)
        if (err.code === '23505') { 
            setFormError(`A configuration named "${formModelName.trim()}" already exists.`);
        } else {
            setFormError(err.message || 'Failed to save configuration.');
        }
    } finally {
        setFormIsSaving(false);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingConfig(null);
    setFormError(null);
    // Reset form fields when closing?
    // setFormModelName(''); setFormProviderType('Anthropic'); ...etc
  };

  // --- Other handlers (handleDeleteClick, handleSetDefaultClick) remain the same ---
  const handleDeleteClick = async (config: LlmConfiguration) => {
    console.log("Delete configuration clicked:", config.id);
    if (configurations.length <= 1) {
        setError("You cannot delete your only LLM configuration.");
        return;
    }
    if (config.is_default) {
        setError("Cannot delete the default configuration. Set another as default first.");
        return;
    }
    if (!window.confirm(`Are you sure you want to delete the configuration "${config.model_name}"?`)) {
        return;
    }
    setLoading(true);
    setError(null);
    try {
        const { error: deleteError } = await supabase
            .from('llm_user_configurations')
            .delete()
            .eq('id', config.id);
        if (deleteError) throw deleteError;
        setSuccessMessage('Configuration deleted successfully.');
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchData(); // Refresh list
    } catch (err: any) {
        console.error('Error deleting configuration:', err);
        setError(err.message || 'Failed to delete configuration.');
    } finally {
        setLoading(false);
    }
  };

  const handleSetDefaultClick = async (configId: string) => {
    console.log("Set default clicked:", configId);
    setLoading(true);
    setError(null);
    try {
        // The trigger function `ensure_single_default_llm` handles unsetting the old default
        const { error: updateError } = await supabase
            .from('llm_user_configurations')
            .update({ is_default: true })
            .eq('id', configId);
        
        if (updateError) throw updateError;
        
        setSuccessMessage('Default configuration updated.');
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchData(); // Refresh list to show the new default
    } catch (err: any) {
        console.error('Error setting default configuration:', err);
        setError(err.message || 'Failed to set default configuration.');
    } finally {
        setLoading(false);
    }
  };

  // --- Render Logic ---
  // const isPaidUser = extPayUser?.paid === true; // Use the new state variable instead
  const isEndpointRequiredForForm = formProviderType === 'Azure OpenAI' || formProviderType === 'Custom';

  return (
    <div className="box">
      <h2>Settings</h2>

      {loading && <p><span className="loading"></span> Loading settings...</p>}
      {error && <p className="error">{error}</p>}
      {successMessage && <p className="success">{successMessage}</p>}

      {!loading && (
        <>
          {/* Payment Status Section */}
          <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #555' }}>
            <h3>Account Status</h3>
            <p>
                Status: <strong style={{ color: isPaidUser ? '#4ade80' : '#facc15' }}>{isPaidUser ? 'Premium User' : 'Free User'}</strong>
                {/* Display email from session if needed */}
                {isPaidUser && userEmail && <small> ({userEmail})</small>}
            </p>
            {/* Disable or hide upgrade button when ExtPay is commented out */}
            {/* 
            <button 
                className="button"
                onClick={() => extpay.openPaymentPage()} // This would cause an error now
                style={{ marginTop: '10px' }}
                disabled={loading}
            >
                {isPaidUser ? 'Manage Subscription / Billing' : 'Upgrade to Premium'}
            </button>
            */}
             <button 
                className="button"
                style={{ marginTop: '10px', backgroundColor: '#555', cursor: 'not-allowed' }}
                disabled={true} // Disable upgrade button
                title="Payment system temporarily disabled"
            >
                {isPaidUser ? 'Manage Subscription (Disabled)' : 'Upgrade (Disabled)'}
            </button>
            {/* Add Sign Out Button */}
            <button
                className="button button-secondary" // Use secondary style or create a specific one
                onClick={handleSignOut}
                style={{ marginTop: '10px', marginLeft: '10px' }} // Add some spacing
                disabled={loading} // Disable while loading/signing out
            >
              {loading ? 'Signing Out...' : 'Sign Out'}
            </button>
          </div>

          {/* LLM Configurations Section */}
          <h3>LLM Configurations</h3>
          
          {/* Configuration List */} 
          {!loading && configurations.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {configurations.map((config) => (
                <li key={config.id} style={{ border: '1px solid #444', borderRadius: '4px', padding: '10px', marginBottom: '10px', background: '#2a2a2a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '1.1em' }}>{config.model_name}</strong>
                    <div>
                      {config.is_default ? (
                        <span style={{ color: '#4ade80', marginRight: '10px', fontWeight: 'bold' }}>Default</span>
                      ) : (
                        <button 
                          className="button button-secondary" 
                          style={{ padding: '3px 6px', fontSize: '0.8em', marginRight: '5px' }}
                          onClick={() => handleSetDefaultClick(config.id)}
                          disabled={loading}
                        >
                          Set Default
                        </button>
                      )}
                      <button 
                        className="button button-secondary" 
                        style={{ padding: '3px 6px', fontSize: '0.8em', marginRight: '5px' }}
                        onClick={() => handleEditClick(config)}
                        disabled={loading}
                       >
                          Edit
                      </button>
                      <button 
                        className="button button-danger" // Assuming a danger style
                        style={{ padding: '3px 6px', fontSize: '0.8em' }}
                        onClick={() => handleDeleteClick(config)}
                        disabled={loading || config.is_default || configurations.length <= 1}
                      >
                          Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.9em', color: '#ccc' }}>
                    Provider: {config.provider_type}
                    {config.api_endpoint && ` | Endpoint: ${config.api_endpoint}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && configurations.length === 0 && (
            <p>No LLM configurations found. Add one below.</p>
          )}

          {/* Add New Button */} 
          {!loading && (
              <button 
                className="button button-primary" 
                onClick={handleAddClick}
                disabled={loading || configurations.length >= MAX_CONFIGURATIONS}
                style={{ marginTop: '15px' }}
                title={configurations.length >= MAX_CONFIGURATIONS ? `Maximum ${MAX_CONFIGURATIONS} configurations reached` : 'Add a new LLM configuration'}
              >
                Add New Configuration
              </button>
          )}

          {/* Add/Edit Form (Modal or Inline) */} 
          {showForm && (
              <div className="modal-or-inline-form" style={{ marginTop: '20px', padding: '15px', border: '1px solid #555', borderRadius: '4px', background: '#333' }}>
                <h4>{editingConfig ? 'Edit Configuration' : 'Add New Configuration'}</h4>
                {formError && <p className="error" style={{ color: '#f87171'}}>{formError}</p>}
                
                {/* Form fields */} 
                {/* Model Name */}
                <div className="form-group">
                    <label htmlFor="formModelName">Model Name *</label>
                    <input
                        type="text"
                        id="formModelName"
                        className="input"
                        placeholder="Unique name (e.g., Personal Claude)"
                        value={formModelName}
                        onChange={(e) => setFormModelName(e.target.value)}
                        disabled={formIsSaving}
                        required
                    />
                </div>
                {/* Provider Type */}
                <div className="form-group">
                    <label htmlFor="formProviderType">Provider Type *</label>
                    <select
                        id="formProviderType"
                        className="input"
                        value={formProviderType}
                        onChange={(e) => setFormProviderType(e.target.value as ProviderType)}
                        disabled={formIsSaving}
                        required
                    >
                        {providerTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>
                {/* API Key */}
                <div className="form-group">
                    <label htmlFor="formApiKey">API Key *</label>
                    <input
                        type="password"
                        id="formApiKey"
                        className="input"
                        placeholder={formProviderType === 'Google' ? "Paste Google AI Studio key" : (editingConfig ? "Enter new key to update" : "Enter API key")}
                        value={formApiKey}
                        onChange={(e) => setFormApiKey(e.target.value)}
                        disabled={formIsSaving}
                        required
                    />
                     {editingConfig && <small style={{ display: 'block', color: '#aaa', marginTop: '3px' }}>Leave blank to keep existing key.</small>}
                     {/* Add instructions specifically for Google in the form */}
                     {formProviderType === 'Google' && (
                        <p style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>
                        Get your free API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>Google AI Studio</a>. 
                        This allows the extension to use the free Gemini Flash model via your account.
                        </p>
                     )}
                </div>
                {/* API Endpoint (Conditional) */}
                {isEndpointRequiredForForm && (
                    <div className="form-group">
                        <label htmlFor="formApiEndpoint">API Endpoint *</label>
                        <input
                            type="text"
                            id="formApiEndpoint"
                            className="input"
                            placeholder="Full URL for the API endpoint"
                            value={formApiEndpoint}
                            onChange={(e) => setFormApiEndpoint(e.target.value)}
                            disabled={formIsSaving}
                            required={isEndpointRequiredForForm}
                        />
                    </div>
                )}

                {/* Form Action Buttons */} 
                <div style={{ marginTop: '15px' }}>
                    <button onClick={handleCloseForm} className="button button-secondary" style={{ marginRight: '10px' }} disabled={formIsSaving}>
                        Cancel
                    </button>
                    <button onClick={handleSaveForm} className="button button-primary" disabled={formIsSaving}>
                        {formIsSaving ? <span className="loading"></span> : (editingConfig ? 'Update Configuration' : 'Save Configuration')}
                    </button>
                </div>
              </div>
          )}
        </>
      )}
    </div>
  );
};

export default SettingsTab; 