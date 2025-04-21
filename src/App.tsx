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

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true) // Represents initial session load
  const [needsOnboarding, setNeedsOnboarding] = useState(false) 
  const [profileChecked, setProfileChecked] = useState(false); 

  // Function to check profile and onboarding status - ONLY called when session is KNOWN to exist
  const checkProfileAndOnboarding = async (currentSession: Session) => {
    // No need for !currentSession check here
    setProfileChecked(false); // Reset check status for this run
    // Consider adding a specific loading indicator for profile check if needed
    try {
      console.log("Checking profile for onboarding status...");
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', currentSession.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') { 
          console.error("Error fetching profile:", profileError);
          setNeedsOnboarding(true); 
      } else {
          setNeedsOnboarding(!profile?.onboarding_complete);
          console.log("Onboarding status:", !profile?.onboarding_complete);
      }
    } catch (error) {
      console.error("Error checking profile:", error);
      setNeedsOnboarding(true); 
    } finally {
      setProfileChecked(true); // Mark as checked for this session
      // We don't manage the main 'loading' state here anymore
    }
  };

  // Callback function to be passed to OnboardingFlow
  const handleOnboardingComplete = () => {
    console.log("Onboarding complete signal received by App.tsx. Re-checking profile.");
    if (session) {
      // Reset profileChecked to ensure the effect runs
      setProfileChecked(false);
      // Explicitly trigger the profile check again now that onboarding is done
      checkProfileAndOnboarding(session);
    } else {
      console.warn("Onboarding completed but session is unexpectedly null.");
    }
  };

  // --- Initial Auth Check and Listener Setup --- 
  useEffect(() => {
    setLoading(true); // Start loading for initial session check
    
    // Initial check
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("Initial session fetched:", initialSession);
      setSession(initialSession);
      setLoading(false); // <--- Stop initial loading HERE
    }).catch(err => {
      console.error("Error getting initial session:", err);
      setSession(null);
      setLoading(false); // <--- Stop initial loading HERE on error too
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        console.log("Auth state changed event:", _event, newSession);
        setSession(newSession);
        setProfileChecked(false); // Reset profile check needed status
        // DO NOT set loading = true here
      }
    );

    // Cleanup function
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []); // Run only once on mount

  // --- Effect to Check Profile based on Session --- 
  useEffect(() => {
    console.log("Session effect triggered. Session:", session);
    if (session) {
      // If we have a session, check the profile
      checkProfileAndOnboarding(session);
    } else {
      // If session is null, onboarding isn't needed, profile is considered 'checked' (as there's nothing to check)
      setNeedsOnboarding(false);
      setProfileChecked(true);
    }
  }, [session]); // Re-run only when session object itself changes


  // --- Render Logic --- 
  if (loading) {
    // Only show splash/null during the VERY initial session check
    return null; 
  }

  if (!session) {
    console.log("Rendering AuthFlow");
    return <AuthFlow />; 
  }

  // Session exists, but we might still be checking the profile
  if (!profileChecked) {
      // Show loading or null while profile check is in progress after login/auth change
      console.log("Waiting for profile check...");
      // Optionally return a loading indicator specific to profile check
      return null; 
  }

  // Session exists, check onboarding status
  if (needsOnboarding) {
    console.log("Rendering OnboardingFlow");
    // Pass the callback function as a prop
    return <OnboardingFlow session={session} onOnboardingComplete={handleOnboardingComplete} />;
  }

  // Session exists, profile checked, and onboarding is complete
  console.log("Rendering MainApp");
  return <MainApp session={session} />;

}

export default App
