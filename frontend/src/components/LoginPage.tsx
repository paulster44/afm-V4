import React, { useState } from 'react';
import { auth, googleProvider } from '../utils/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup
} from 'firebase/auth';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (isRegistering) {
        // Register new user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Send email verification
        await sendEmailVerification(userCredential.user);

        setSuccess('Registration successful! Please check your email to verify your account before logging in.');
        setIsRegistering(false);
        setPassword('');
        // We sign them out immediately so they are forced to verify email to log back in
        await auth.signOut();
      } else {
        // Log in existing user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // Enforce email verification (optional but requested for robustness)
        if (!userCredential.user.emailVerified) {
          setError('Please verify your email address. Check your inbox (and spam folder) for the verification link.');
          await auth.signOut();
        } else {
          // Success! The AuthContext's onAuthStateChanged observer will handle the session
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(err.message || 'An error occurred during authentication.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('If an account exists with that email, a password reset link has been sent. Check your inbox and spam folder.');
    } catch {
      // Don't reveal whether email exists — always show generic success
      setSuccess('If an account exists with that email, a password reset link has been sent. Check your inbox and spam folder.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // The AuthContext observer takes over instantly since this auto-verifies
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetMessages = () => {
    setError('');
    setSuccess('');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 px-4">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded-lg shadow-md">
        <h2 className="text-3xl font-bold text-center text-white mb-2">
          {isForgotPassword ? 'Reset Password' : isRegistering ? 'Create Account' : 'AFM Smart Contract Generator'}
        </h2>
        <p className="text-sm text-center text-gray-400 mb-8">
          {isForgotPassword ? 'Enter your email to receive a reset link' : isRegistering ? 'Start creating contracts today' : 'Sign in to your account'}
        </p>

        {!isForgotPassword && (
          <>
            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex justify-center items-center px-4 py-2 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 mb-6 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {isRegistering ? 'Sign up with Google' : 'Sign in with Google'}
            </button>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800 text-gray-400">Or continue with email</span>
              </div>
            </div>
          </>
        )}

        <form className="space-y-6" onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address" name="email" type="email" autoComplete="email" required
                className="w-full px-3 py-2 text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:border-indigo-500 sm:text-sm"
                placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {!isForgotPassword && (
              <div>
                <label htmlFor="password" className="sr-only">Password</label>
                <input
                  id="password" name="password" type="password" autoComplete={isRegistering ? "new-password" : "current-password"} required
                  className="w-full px-3 py-2 text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:border-indigo-500 sm:text-sm"
                  placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {!isRegistering && !isForgotPassword && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setIsForgotPassword(true); resetMessages(); }}
                  className="text-sm text-indigo-400 hover:text-indigo-300"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-center text-red-500 bg-red-500/10 p-2 rounded">{error}</p>}
          {success && <p className="text-sm text-center text-green-400 bg-green-500/10 p-2 rounded">{success}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Processing...' : isForgotPassword ? 'Send Reset Link' : (isRegistering ? 'Sign Up with Email' : 'Sign In with Email')}
          </button>
        </form>

        <div className="mt-6 text-sm text-center">
          {isForgotPassword ? (
            <button
              onClick={() => { setIsForgotPassword(false); resetMessages(); }}
              className="font-medium text-indigo-400 hover:text-indigo-300"
            >
              Back to Sign In
            </button>
          ) : (
            <button
              onClick={() => { setIsRegistering(!isRegistering); resetMessages(); }}
              className="font-medium text-indigo-400 hover:text-indigo-300"
            >
              {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          )}
        </div>


      </div>
    </div>
  );
};

export default LoginPage;
