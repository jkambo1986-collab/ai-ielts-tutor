/**
 * @file A component that provides a unified interface for user login, signup, and password recovery.
 */

import React, { useState } from 'react';
import { authService } from '../services/authService';
import { AuthView, UserProfile } from '../types';
import Button from './Button';
import { useAppContext } from '../App';

interface AuthPageProps {}

/**
 * The main authentication page component. It renders the correct form based on the current view.
 */
const AuthPage: React.FC<AuthPageProps> = () => {
    const [view, setView] = useState<AuthView>('login');
    
    const renderView = () => {
        switch(view) {
            case 'signup':
                return <SignupForm setView={setView} />;
            case 'forgotPassword':
                return <ForgotPasswordForm setView={setView} />;
            case 'login':
            default:
                return <LoginForm setView={setView} />;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col justify-center items-center p-4">
             <div className="flex items-center space-x-3 mb-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 11.5l3.5 3.5"></path><path d="M12 8v8"></path><path d="M8.5 15L12 11.5"></path>
                </svg>
                <span className="text-3xl font-bold text-slate-800 dark:text-slate-200">AI IELTS Tutor</span>
            </div>
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-8">
                {renderView()}
            </div>
             <footer className="text-center py-4 mt-8 text-sm text-slate-500 dark:text-slate-400">
                <p>Powered by Google Gemini</p>
            </footer>
        </div>
    );
};

// -- FORM COMPONENTS -- //

interface FormProps {
    setView: (view: AuthView) => void;
}

const LoginForm: React.FC<Pick<FormProps, 'setView'>> = ({ setView }) => {
    const { handleLoginSuccess } = useAppContext();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            const user = await authService.login(email, password);
            handleLoginSuccess(user);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-center mb-1 text-slate-800 dark:text-slate-200">Welcome Back!</h2>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-6">Log in to continue your practice.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-red-500 text-sm text-center" role="alert">{error}</p>}
                <InputField label="Email Address" type="email" value={email} onChange={setEmail} required />
                <InputField label="Password" type="password" value={password} onChange={setPassword} required />
                <div className="text-right text-sm">
                    <button type="button" onClick={() => setView('forgotPassword')} className="font-medium text-blue-600 hover:text-blue-500">Forgot password?</button>
                </div>
                <Button type="submit" isLoading={isLoading} className="w-full">Log In</Button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Don't have an account?{' '}
                <button onClick={() => setView('signup')} className="font-medium text-blue-600 hover:text-blue-500">Sign up</button>
            </p>
        </div>
    );
};

const SignupForm: React.FC<Pick<FormProps, 'setView'>> = ({ setView }) => {
    const { handleLoginSuccess } = useAppContext();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        if (password.length < 10) {
            setError("Password must be at least 10 characters long.");
            return;
        }
        setError(null);
        setIsLoading(true);
        try {
            const user = await authService.signup(name, email, password);
            handleLoginSuccess(user);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
         <div>
            <h2 className="text-2xl font-bold text-center mb-1 text-slate-800 dark:text-slate-200">Create an Account</h2>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-6">Start your journey to IELTS success.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-red-500 text-sm text-center" role="alert">{error}</p>}
                <InputField label="Full Name" type="text" value={name} onChange={setName} required />
                <InputField label="Email Address" type="email" value={email} onChange={setEmail} required />
                <InputField label="Password" type="password" value={password} onChange={setPassword} required />
                <InputField label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} required />
                <Button type="submit" isLoading={isLoading} className="w-full">Create Account</Button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Already have an account?{' '}
                <button onClick={() => setView('login')} className="font-medium text-blue-600 hover:text-blue-500">Log in</button>
            </p>
        </div>
    );
};

const ForgotPasswordForm: React.FC<Pick<FormProps, 'setView'>> = ({ setView }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await authService.requestPasswordReset(email);
        setIsLoading(false);
        setMessage("If an account exists for that email, a password reset link has been sent. (This is a simulation)");
    };

    return (
        <div>
            <h2 className="text-2xl font-bold text-center mb-1 text-slate-800 dark:text-slate-200">Forgot Password</h2>
             <p className="text-center text-slate-500 dark:text-slate-400 mb-6">Enter your email to reset your password.</p>
            {message ? (
                <p className="text-green-600 text-center">{message}</p>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <InputField label="Email Address" type="email" value={email} onChange={setEmail} required />
                    <Button type="submit" isLoading={isLoading} className="w-full">Send Reset Link</Button>
                </form>
            )}
            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Remembered your password?{' '}
                <button onClick={() => setView('login')} className="font-medium text-blue-600 hover:text-blue-500">Back to Login</button>
            </p>
        </div>
    );
};

// -- HELPER COMPONENTS -- //

interface InputFieldProps {
    label: string;
    type: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({ label, type, value, onChange, required }) => (
    <div>
        <label htmlFor={label} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
        </label>
        <div className="mt-1">
            <input
                id={label}
                name={label}
                type={type}
                required={required}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-900"
            />
        </div>
    </div>
);


export default AuthPage;