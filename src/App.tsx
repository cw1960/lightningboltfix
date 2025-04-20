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
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false) // Placeholder state

  // Function to check authentication status
  const checkAuth = async () => {
    setLoading(true)
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      setSession(session)

      if (session) {
        // TODO: Check if user needs onboarding (e.g., fetch profile)
        // For now, assume they need onboarding if logged in
        // Replace this logic later
        const { data: profile, error: profileError } = await supabase
          .from('profiles') // Assuming a 'profiles' table
          .select('onboarding_complete')
          .eq('id', session.user.id)
          .single()

        if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = row not found
            console.error("Error fetching profile:", profileError);
            // Decide how to handle profile fetch error - maybe default to onboarding?
            setNeedsOnboarding(true);
        } else {
            setNeedsOnboarding(!profile?.onboarding_complete);
        }

      } else {
        setNeedsOnboarding(false); // Not logged in, doesn't need onboarding flow yet
      }

    } catch (error) {
      console.error("Error in checkAuth:", error)
      setSession(null) // Ensure session is null on error
      setNeedsOnboarding(false);
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Expose checkAuth globally for splash-handler.js
    window.checkAuthState = checkAuth;

    // Run initial check
    checkAuth()

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log("Auth state changed:", _event, session);
        setSession(session)
        setLoading(false) // Stop loading once we get an auth event

        // Re-check onboarding status when auth state changes
        if (session) {
           const checkOnboarding = async () => {
                const { data: profile, error: profileError } = await supabase
                  .from('profiles')
                  .select('onboarding_complete')
                  .eq('id', session.user.id)
                  .single();

                if (profileError && profileError.code !== 'PGRST116') {
                    console.error("Error fetching profile on auth change:", profileError);
                    setNeedsOnboarding(true); // Default to onboarding on error?
                } else {
                    setNeedsOnboarding(!profile?.onboarding_complete);
                }
           }
           checkOnboarding();
        } else {
            setNeedsOnboarding(false);
        }
      }
    )

    // Cleanup function
    return () => {
      authListener?.subscription.unsubscribe()
      delete window.checkAuthState; // Clean up global function
    }
  }, []) // Run only once on mount

  // Render based on loading and session state
  if (loading) {
    return null // Splash screen handles initial view
  }

  if (!session) {
    return <AuthFlow />
  }

  if (needsOnboarding) {
    return <OnboardingFlow session={session} />
  }

  // Use the imported component
  return <MainApp session={session} />

}

export default App
