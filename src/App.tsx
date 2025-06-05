import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import AuthFlow from './components/AuthFlow'; // Import the actual component
import OnboardingFlow from './components/OnboardingFlow'; // Import the actual component
import MainApp from './components/MainApp'; // Import the actual component

// Placeholder components - we will create these later
// const AuthFlow = () => <div>Auth Flow (Sign In/Sign Up)</div> // Remove placeholder
// const OnboardingFlow = ({ session }: { session: Session }) => ( // Remove placeholder
//   <div>Onboarding Flow for {session.user.email}</div>
// )

// --- Augmenting the Window interface ---
// This tells TypeScript that our custom function might exist on the window object.
declare global {
  interface Window {
    checkAuthState?: () => void;
  }
}
// --- End Augmentation ---

type AppStatus = 'LOADING' | 'AUTH_REQUIRED' | 'ONBOARDING_REQUIRED' | 'READY' | 'PROFILE_ERROR';

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [appStatus, setAppStatus] = useState<AppStatus>('LOADING');
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null); // Optional: specific error message
  const [apiKey, setApiKey] = useState<string | null>(null); // Store the assigned API key

  // Function to check profile and determine next status
  const checkProfileAndSetStatus = async (currentSession: Session) => {
    try {
      console.log("Checking profile for onboarding status...");
      setAppStatus('LOADING'); // Indicate profile check is happening
      setProfileErrorMsg(null);

      const USER_ID_COLUMN = 'id'; // Change this to match your DB if needed (e.g., 'user_id')
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq(USER_ID_COLUMN, currentSession.user.id)
        .limit(1);

      if (error) {
        console.error("Error fetching profile:", error);
        alert("Supabase error: " + JSON.stringify(error));
        throw new Error("Failed to fetch user profile.");
      }

      // If profile exists and onboarding is complete
      const profile = profiles && profiles.length > 0 ? profiles[0] : null;
      if (profile?.onboarding_complete) {
          console.log("Onboarding complete, setting status to READY");
          setAppStatus('READY');
      } else {
          // If profile doesn't exist (PGRST116) or onboarding_complete is false
          console.log("Onboarding required, setting status to ONBOARDING_REQUIRED");
          setAppStatus('ONBOARDING_REQUIRED');
      }
    } catch (error: any) {
      console.error("Error checking profile:", error);
      setProfileErrorMsg(error.message || "An error occurred while checking profile.");
      setAppStatus('PROFILE_ERROR'); // Set a specific error status
    }
  };

  // Callback for OnboardingFlow to signal completion
  const handleOnboardingComplete = () => {
    console.log("Onboarding complete signal received. Setting status to READY.");
    // Directly set status to READY, assuming profile was just updated
    setAppStatus('READY'); 
  };

  // Helper to call the Edge Function and fetch the user's profile
  const assignAndFetchApiKey = async (userId: string) => {
    try {
      // 1. Call the Edge Function to assign the least-used API key
      await fetch('https://szyywrcngcggimkbwbbl.functions.supabase.co/get-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}` // Add JWT for Supabase Edge Function
        },
        body: JSON.stringify({ user_id: userId }),
      });
      // 2. Fetch the user's profile to get the assigned key
      const { data, error } = await supabase
        .from('profiles')
        .select('default_llm')
        .eq('id', userId)
        .single();
      if (error) {
        setApiKey(null);
        console.error('Error fetching profile for API key:', error);
      } else {
        setApiKey(data?.default_llm || null);
        console.log('Fetched assigned API key:', data?.default_llm);
        if (data?.default_llm) {
          console.log('API key is available for use:', data.default_llm);
        }
      }
    } catch (_) {
      setApiKey(null);
      // Error is intentionally ignored here
    }
  };

  // --- Auth Setup Effect --- 
  useEffect(() => {
    setAppStatus('LOADING'); // Initial status
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (!initialSession) {
        setAppStatus('AUTH_REQUIRED');
      }
    }).catch(_ => {
      setSession(null);
      setAppStatus('AUTH_REQUIRED');
    });
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        const sessionChanged = newSession?.access_token !== session?.access_token;
        setSession(newSession);
        if (!newSession) {
          setAppStatus('AUTH_REQUIRED');
        } else if (sessionChanged) {
          setAppStatus('LOADING');
        }
      }
    );
    return () => {
      authListener?.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Effect to Check Profile and Assign API Key --- 
  useEffect(() => {
    if (session) {
      setAppStatus('LOADING');
      assignAndFetchApiKey(session.user.id).then(() => {
        checkProfileAndSetStatus(session);
      });
    } else {
      setAppStatus('AUTH_REQUIRED');
    }
  }, [session]);

  // Use apiKey somewhere to avoid TS error (for now, just log it)
  useEffect(() => {
    if (apiKey) {
      console.log('apiKey in App:', apiKey);
    }
  }, [apiKey]);

  // --- Render Logic --- 
  const renderContent = () => {
      console.log("Rendering based on status:", appStatus);
      switch (appStatus) {
          case 'LOADING':
              return null; // Splash handles initial load
          case 'AUTH_REQUIRED':
              return <AuthFlow />;
          case 'ONBOARDING_REQUIRED':
              return <OnboardingFlow session={session!} onOnboardingComplete={handleOnboardingComplete} />;
          case 'READY':
              return <MainApp session={session!} />;
          case 'PROFILE_ERROR':
              // Simple error display, could be enhanced
              return <div className="box error">Error: {profileErrorMsg || "Could not load profile."} Please try reloading the extension.</div>;
          default:
              console.error("Unhandled app status:", appStatus);
              return <div>An unexpected error occurred.</div>;
      }
  }
  
  // Use a key on the outer div tied to appStatus to help React differentiate states?
  // Might not be necessary but can help in complex transitions.
  return (
      <div key={appStatus}>
          {renderContent()}
      </div>
  );

}

export default App
