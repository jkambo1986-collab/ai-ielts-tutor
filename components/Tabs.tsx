/**
 * @file A component that renders the main navigation tabs for switching between practice sections.
 */

import React from 'react';
import { ADMIN_ROLES, IELTSSection } from '../types';
import { SpeakingIcon, WritingIcon, ReadingIcon, ListeningIcon, DashboardIcon, QuizIcon, IntegratedSkillsIcon, UserIcon } from './Icons';
import { useAppContext } from '../App';

/**
 * The Tabs navigation component.
 * @returns {React.FC} The rendered tabs.
 */
const Tabs: React.FC = () => {
  const { activeTab, setActiveTab, isSectionLoading, currentUser } = useAppContext();
  const isAdmin = currentUser ? ADMIN_ROLES.includes(currentUser.role) : false;

  // Tab configuration. The Admin tab is appended only for admin roles.
  const tabs = [
    { name: IELTSSection.Dashboard, icon: DashboardIcon },
    { name: IELTSSection.Speaking, icon: SpeakingIcon },
    { name: IELTSSection.Writing, icon: WritingIcon },
    { name: IELTSSection.Reading, icon: ReadingIcon },
    { name: IELTSSection.Listening, icon: ListeningIcon },
    { name: IELTSSection.IntegratedSkills, icon: IntegratedSkillsIcon },
    { name: IELTSSection.Quiz, icon: QuizIcon },
    ...(isAdmin ? [{ name: IELTSSection.Admin, icon: UserIcon }] : []),
  ];

  return (
    <div className="flex justify-center">
      <div role="tablist" aria-label="IELTS Sections" className="bg-white dark:bg-slate-800 rounded-lg p-1.5 shadow-md flex space-x-2 flex-wrap justify-center gap-1">
        {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.name;
            return (
              <button
                key={tab.name}
                role="tab"
                aria-selected={isActive}
                aria-controls="main-content"
                id={`tab-${tab.name}`}
                onClick={() => setActiveTab(tab.name)}
                disabled={isSectionLoading}
                // Dynamically apply styles based on whether the tab is active.
                className={`flex items-center justify-center w-full sm:w-auto px-4 py-2.5 text-sm font-medium rounded-md focus:outline-none transition-colors duration-200
                  ${
                    isActive
                      ? 'bg-blue-500 text-white shadow'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  } ${isSectionLoading ? 'opacity-70 cursor-not-allowed' : ''}
                `}
              >
                <Icon className="w-5 h-5 mr-2" />
                {tab.name}
              </button>
            );
        })}
      </div>
    </div>
  );
};

export default Tabs;