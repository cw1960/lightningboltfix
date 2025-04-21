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

  // Function to check profile and determine next status
  const checkProfileAndSetStatus = async (currentSession: Session) => {
    try {
      console.log("Checking profile for onboarding status...");
      setAppStatus('LOADING'); // Indicate profile check is happening
      setProfileErrorMsg(null);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', currentSession.user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Handle actual errors
          console.error("Error fetching profile:", error);
          throw new Error("Failed to fetch user profile."); // Throw to be caught below
      }

      // If profile exists and onboarding is complete
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

  // --- Auth Setup Effect --- 
  useEffect(() => {
    setAppStatus('LOADING'); // Initial status
    
    // Initial session check
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("Initial session fetched:", initialSession);
      setSession(initialSession);
      if (!initialSession) {
        setAppStatus('AUTH_REQUIRED');
      } 
      // If session exists, the effect below will trigger the profile check
    }).catch(err => {
      console.error("Error getting initial session:", err);
      setSession(null);
      setAppStatus('AUTH_REQUIRED'); // Go to auth on error
    });

    // Auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        console.log("Auth state changed event:", _event, newSession);
        const sessionChanged = newSession?.access_token !== session?.access_token;
        setSession(newSession);
        if (!newSession) {
            setAppStatus('AUTH_REQUIRED');
        } else if (sessionChanged) {
             // If session changed (e.g. login/logout), trigger profile check
            // The effect below handles this based on session change
            setAppStatus('LOADING'); // Reset to loading before profile check
        } 
        // If only profile data changed (handled by onOnboardingComplete), session remains same, no status change here
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // --- Effect to Check Profile based on Session --- 
  useEffect(() => {
    console.log("Session effect triggered. Session:", session, "Status:", appStatus);
    if (session && appStatus === 'LOADING') {
      // Only check profile if we have a session AND we are in a loading state 
      // (implies we just got the session or auth state changed)
      checkProfileAndSetStatus(session);
    } else if (!session && appStatus !== 'AUTH_REQUIRED') {
        // If session becomes null unexpectedly, force Auth screen
        setAppStatus('AUTH_REQUIRED');
    }
  // We only want this effect to run when the session object *reference* changes OR if appStatus becomes LOADING
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [session, appStatus]); 


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
