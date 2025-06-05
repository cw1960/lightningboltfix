import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';
import ExtPay from 'extpay'; // Uncomment ExtPay import

// Import or define the LlmConfiguration interface (make sure it matches MainApp)
interface LlmConfiguration {
    id: string;
    profile_id: string;
    provider_type: 'Anthropic' | 'Google' | 'OpenAI' | 'Azure OpenAI' | 'Meta' | 'DeepSeek' | 'Cohere' | 'Mistral' | 'Alibaba' | 'Other';
    model_name: string;
    api_key: string;
    api_endpoint: string | null;
    is_default: boolean;
    created_at: string;
}

// Define allowed provider types (updated list)
type ProviderType = LlmConfiguration['provider_type'];
const providerTypes: ProviderType[] = ['Google', 'Anthropic', 'OpenAI', 'Meta', 'DeepSeek', 'Cohere', 'Mistral', 'Alibaba', 'Other'];

// Initialize ExtPay - Use your Extension ID
const extpay = ExtPay('lightning-bolt-fix'); // Updated ExtensionPay initialization

interface SettingsTabProps {
  session: Session;
  refreshTrigger: number;
}

// Define ExtPay user structure (simplified based on docs)
interface ExtPayUser {
    paid: boolean;
    email: string | null;
    // Add other fields if needed (trialStartedAt, etc.)
}

// Add the constant for the limit
const FREE_FIX_LIMIT = 10;

const SettingsTab: React.FC<SettingsTabProps> = ({ session, refreshTrigger }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [freeFixesUsed, setFreeFixesUsed] = useState<number>(0);
  const [configurations, setConfigurations] = useState<LlmConfiguration[]>([]);
  const [extPayUser, setExtPayUser] = useState<ExtPayUser | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<LlmConfiguration | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formModelName, setFormModelName] = useState('');
  const [formProviderType, setFormProviderType] = useState<ProviderType>('Anthropic');
  const [formApiKey, setFormApiKey] = useState('');
  const [formApiEndpoint, setFormApiEndpoint] = useState('');
  const [formIsSaving, setFormIsSaving] = useState(false);
  const [useBuiltinKeys, setUseBuiltinKeys] = useState<boolean>(false);
  const [useBuiltinKeysLoading, setUseBuiltinKeysLoading] = useState<boolean>(true);

  const MAX_CONFIGURATIONS = 5;

  // --- Sign Out Handler ---
  const handleSignOut = async () => {
    setError(null); // Clear previous errors
    setLoading(true); // Indicate activity
    try {
      // 1. Release built-in API key before signing out
      try {
        const response = await fetch('https://szyywrcngcggimkbwbbl.functions.supabase.co/release-api-key', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ user_id: session.user.id })
        });
        if (!response.ok) {
          const errText = await response.text();
          console.warn('Failed to release API key on logout:', errText);
        } else {
          const data = await response.json();
          if (!data.released) {
            console.log('No built-in API key to release or already released.');
          } else {
            console.log('Released built-in API key:', data.releasedKey);
          }
        }
      } catch (releaseErr) {
        console.warn('Error calling release-api-key function:', releaseErr);
        // Proceed to sign out regardless
      }
      // 2. Sign out
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

  // Remove useCallback wrapper from fetchData
  const fetchData = async () => {
    console.log("[SettingsTab fetchData] Fetching data...");
    setLoading(true);
    setError(null);
    // Don't reset fixes used here, let the fetch update it
    // setFreeFixesUsed(0);
    try {
      // Fetch LLM Configurations (keep as is)
      const { data: configData, error: configError } = await supabase
        .from('llm_user_configurations')
        .select('*')
        .eq('profile_id', session.user.id)
        .order('created_at', { ascending: true });

      if (configError) throw new Error(`Failed to load LLM configurations: ${configError.message}`);
      setConfigurations(configData || []);

      // Fetch ExtPay User Status (keep as is)
      try {
          const user = await extpay.getUser();
          console.log("ExtPay User:", user);
          setExtPayUser(user);
      } catch (extPayError: any) {
          console.error("Error fetching ExtPay user:", extPayError);
          setError("Could not retrieve payment status. Please try again later.");
          setExtPayUser({ paid: false, email: null });
      }

      // Fetch Free Fix Count and use_builtin_keys flag
      const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('free_fixes_used, use_builtin_keys')
          .eq('id', session.user.id)
          .maybeSingle<{ free_fixes_used: number, use_builtin_keys?: boolean }>();
          
      if (profileError) {
          // Check if the error is because the row doesn't exist or column is null
          if (profileError.code === 'PGRST116') { 
              console.warn("[SettingsTab fetchData] Profile row or free_fixes_used column not found for user. Setting fixes used to 0.");
              setFreeFixesUsed(0);
          } else {
              console.error("[SettingsTab fetchData] Error fetching profile:", profileError);
              throw new Error(`Failed to load profile data: ${profileError.message}`);
          }
      } else {
          // Only update if profileData is not null
          const fixesUsed = profileData?.free_fixes_used ?? 0;
          console.log(`[SettingsTab fetchData] Fetched profile data. free_fixes_used: ${fixesUsed}`);
          setFreeFixesUsed(fixesUsed);
          setUseBuiltinKeys(!!profileData?.use_builtin_keys);
          setUseBuiltinKeysLoading(false);
      }

    } catch (err: any) {
      console.error('Error fetching settings data:', err);
      setError(`Failed to load settings: ${err.message}`);
      setConfigurations([]);
      setFreeFixesUsed(0);
    } finally {
      setLoading(false);
    }
  };

  // Update useEffect to depend directly on refreshTrigger and session.user.id
  useEffect(() => {
    console.log("[SettingsTab useEffect] Running due to trigger/session change. refreshTrigger:", refreshTrigger);
    fetchData();
  }, [refreshTrigger, session.user.id]); // Dependencies updated

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

    // Update endpoint requirement check
    const isEndpointNowRequired = formProviderType === 'Azure OpenAI' || formProviderType === 'Other';

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
        // Update error message
        setFormError('API Endpoint is required for Azure OpenAI and Other providers.');
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

  // Handler for toggling use_builtin_keys
  const handleToggleBuiltinKeys = async () => {
    setUseBuiltinKeysLoading(true);
    const newValue = !useBuiltinKeys;
    setUseBuiltinKeys(newValue);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ use_builtin_keys: newValue })
        .eq('id', session.user.id);
      if (error) throw error;
      setSuccessMessage('Setting updated!');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err: any) {
      setError('Failed to update setting.');
      setUseBuiltinKeys(!newValue); // revert
    } finally {
      setUseBuiltinKeysLoading(false);
    }
  };

  // --- Render Logic ---
  const isPaidUser = extPayUser?.paid === true; // Use the real ExtPay state variable again
  const isEndpointRequiredForForm = formProviderType === 'Azure OpenAI' || formProviderType === 'Other';

  // Filter out the built-in Gemini config from the list
  const userConfigs = configurations.filter(
    (config) => !(config.provider_type === 'Google' && config.model_name.toLowerCase().includes('gemini'))
  );

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
                {/* Display email from extPayUser */}
                {isPaidUser && extPayUser?.email && <small> ({extPayUser.email})</small>}
            </p>
            {/* Display free fix count if not a paid user */}
            {!isPaidUser && (
                <p style={{ fontSize: '0.9em', color: '#ccc' }}>
                    Free Fixes Used: <strong>{freeFixesUsed ?? 0} / {FREE_FIX_LIMIT}</strong>
                </p>
            )}
            {/* Uncomment original ExtPay button */}
            <button 
                className="button"
                onClick={() => extpay.openPaymentPage()} // Restore original onClick
                style={{ marginTop: '10px' }}
                disabled={loading || !extPayUser} // Disable until extPayUser loaded
            >
                {isPaidUser ? 'Manage Subscription / Billing' : 'Upgrade to Premium'}
            </button>
            {/* Add Sign Out Button */}
            <button
                className="signout-link"
                onClick={handleSignOut}
                style={{
                    marginTop: '10px',
                    marginLeft: '10px',
                    background: 'none',
                    border: 'none',
                    fontSize: '0.95em',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 400,
                    color: '#eb4798', // FORCE pink color
                    transition: 'color 0.2s'
                }}
                disabled={loading}
            >
                {loading ? 'Signing Out...' : 'Sign Out'}
            </button>
            {/* Built-in API Key Toggle */}
            <div style={{ marginTop: '15px', marginBottom: '10px', textAlign: 'left' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={useBuiltinKeys}
                  onChange={handleToggleBuiltinKeys}
                  disabled={useBuiltinKeysLoading || loading}
                  style={{ accentColor: '#eb4798', width: 18, height: 18 }}
                />
                Use Built-in API Keys - Recommended for ALL Users.
              </label>
              <div style={{ fontSize: '0.85em', color: '#aaa', marginLeft: 26 }}>
                This is enabled by default - the extension will use our built-in API keys. You do NOT need to provide your own key unless you want to. If you do want to, click the "Add New Configuration" button below.
              </div>
            </div>
          </div>

          {/* LLM Configurations Section */}
          <h3>LLM Configurations</h3>
          
          {/* Configuration List */} 
          {!loading && userConfigs.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {userConfigs.map((config) => (
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
                        disabled={loading || config.is_default || userConfigs.length <= 1}
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
          {!loading && userConfigs.length === 0 && (
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
                
                {/* Provider Type - Moved Up */}
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

                {/* Model Name - Moved Down */}
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