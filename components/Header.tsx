/**
 * @file A dynamic header component for the application.
 * It displays the application title, the current user's name, and a logout button.
 */

import React from 'react';
import { SubscriptionPlan } from '../types';
import { UserIcon } from './Icons';
import { useAppContext } from '../App';

/**
 * The main header component.
 * Note: Self-serve upgrade is intentionally hidden — Pro is granted by
 * institute admins on this platform.
 */
const Header: React.FC = () => {
  const { currentUser: user, handleLogout: onLogout } = useAppContext();

  if (!user) return null; // Should not happen if rendered correctly, but a good safeguard.

  return (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            {/* Logo SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <path d="M12 11.5l3.5 3.5"></path>
              <path d="M12 8v8"></path>
              <path d="M8.5 15L12 11.5"></path>
            </svg>
            <span className="text-xl font-bold text-slate-800 dark:text-slate-200">AI IELTS Tutor</span>
          </div>
          <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                  <UserIcon className="h-6 w-6 text-slate-500" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300 hidden sm:block">{user.name}</span>
                  {user.plan === SubscriptionPlan.Pro && (
                      <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">PRO</span>
                  )}
              </div>
              <button
                onClick={onLogout}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"
              >
                  Logout
              </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;