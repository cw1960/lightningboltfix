import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthFlow: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState(''); // For Sign Up

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      // No need to set session here, the listener in App.tsx handles it
    } catch (err: any) {
      console.error('Sign In Error:', err);
      setError(err.error_description || err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Sign up the user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Include first_name in options.data, it might be picked up by some triggers
          // or accessible later. The profile trigger doesn't use it directly.
          // Also include 'name' as this is often used for the UI Display Name.
          data: {
             first_name: firstName, // Keep for potential direct use or triggers
             name: firstName // Add for better chance of populating UI Display Name
          }
        }
      });

      if (signUpError) throw signUpError;

      // Upsert user profile to ensure data is saved
      if (signUpData.user) {
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert([
            { id: signUpData.user.id, first_name: firstName, email }
          ], { onConflict: 'id' });

        if (upsertError) {
          console.warn('Could not upsert profile after sign up:', upsertError);
          alert("Profile upsert error: " + JSON.stringify(upsertError));
          // Proceed anyway, user is signed up
        } else {
          // Poll for the profile row to appear
          await waitForProfile(signUpData.user.id);
        }
      } else {
         console.warn('Sign up successful but no user data returned immediately.')
      }

      // Inform user to check email if email confirmation is required
      if (signUpData.user?.identities?.length === 0) { // Check if confirmation needed
          alert('Please check your email to confirm your account!');
      } else {
         // Already confirmed or confirmation not needed, App.tsx listener will handle session
      }

    } catch (err: any) {
      console.error('Sign Up Error:', err);
      setError(err.error_description || err.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        {/* Add the logo image */}
        <img
          src="icons/icon128.png"
          alt="Lightning Bolt Fix V3 Logo"
          style={{
            width: '90px',
            height: '90px',
            display: 'block', // Center the image
            margin: '0 auto 16px auto' // Add bottom margin
          }}
        />
        {/* Keep the H1 title below the logo */}
        <h1>Lightning Bolt Fix V3</h1>
      </div>

      {isSignUp ? (
        // Sign Up Form
        <form onSubmit={handleSignUp} className="box">
          <h2>Sign Up</h2>
          <div className="form-group">
            <label htmlFor="firstName">First Name</label>
            <input
              id="firstName"
              type="text"
              className="input"
              placeholder="Your first name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="signUpEmail">Email</label>
            <input
              id="signUpEmail"
              type="email"
              className="input"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="signUpPassword">Password</label>
            <input
              id="signUpPassword"
              type="password"
              className="input"
              placeholder="Create a password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6} // Supabase default
              disabled={loading}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="button" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="loading"></span> : 'Sign Up'}
          </button>
          <div className="auth-footer">
            Already have an account? <a onClick={() => !loading && setIsSignUp(false)}>Sign In</a>
          </div>
        </form>
      ) : (
        // Sign In Form
        <form onSubmit={handleSignIn} className="box">
          <h2>Sign In</h2>
          <div className="form-group">
            <label htmlFor="signInEmail">Email</label>
            <input
              id="signInEmail"
              type="email"
              className="input"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="signInPassword">Password</label>
            <input
              id="signInPassword"
              type="password"
              className="input"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="button" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="loading"></span> : 'Sign In'}
          </button>
          <div className="auth-footer">
            Don't have an account? <a onClick={() => !loading && setIsSignUp(true)}>Sign Up</a>
          </div>
        </form>
      )}
    </div>
  );
};

async function waitForProfile(userId: string, maxAttempts = 10, delayMs = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', userId)
      .limit(1);
    if (data && data.length > 0) return data[0];
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('Profile row did not appear in time');
}

export default AuthFlow; 