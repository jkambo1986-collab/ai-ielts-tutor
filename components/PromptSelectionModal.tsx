/**
 * @file A modal component for selecting IELTS speaking prompts.
 * It allows users to choose a specific question from Part 1, 2, or 3 for targeted practice.
 */

import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import Loader from './Loader';
import { SPEAKING_PROMPTS } from '../constants';
import { SpeakingIcon } from './Icons';
import { ContextualSpeakingPrompt } from '../types';

type PromptPart = 'Suggested' | keyof typeof SPEAKING_PROMPTS;

interface PromptSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectPrompt: (prompt: { part: string; text: string }) => void;
    suggestedPrompts: ContextualSpeakingPrompt[];
    isLoadingSuggestions: boolean;
}

const PromptSelectionModal: React.FC<PromptSelectionModalProps> = ({ isOpen, onClose, onSelectPrompt, suggestedPrompts, isLoadingSuggestions }) => {
    const hasSuggestions = suggestedPrompts.length > 0;
    const [activeTab, setActiveTab] = useState<PromptPart>(hasSuggestions ? 'Suggested' : 'Part 1');
    const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

    // Reset tab when modal opens/suggestions change
    useEffect(() => {
        if (isOpen) {
            setActiveTab(hasSuggestions ? 'Suggested' : 'Part 1');
            setSelectedPrompt(null);
        }
    }, [isOpen, hasSuggestions]);

    const handleSelect = () => {
        if (selectedPrompt) {
            let part = activeTab;
            if (activeTab === 'Suggested') {
                // Find the part from the selected suggested prompt
                const suggested = suggestedPrompts.find(p => p.text === selectedPrompt);
                part = suggested?.part || 'Part 3';
            }
            onSelectPrompt({ part, text: selectedPrompt });
            onClose();
        }
    };
    
    const renderPromptList = () => {
        if (activeTab === 'Suggested') {
            if (isLoadingSuggestions) {
                return <div className="flex justify-center items-center h-full"><Loader text="Generating suggestions..." /></div>;
            }
            if (!hasSuggestions) {
                return <div className="text-center text-slate-500 p-8">Complete some reading or listening practice to get personalized prompt suggestions here!</div>;
            }
            return (
                <div className="space-y-3">
                    {suggestedPrompts.map((prompt, index) => (
                         <button
                            key={index}
                            onClick={() => setSelectedPrompt(prompt.text)}
                            className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-150 ${
                                selectedPrompt === prompt.text
                                ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500 shadow-md'
                                : 'bg-slate-50 dark:bg-slate-700/50 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                        >
                            <div className="flex items-start">
                                <SpeakingIcon className={`h-5 w-5 mt-0.5 mr-3 flex-shrink-0 ${selectedPrompt === prompt.text ? 'text-blue-500' : 'text-slate-400'}`} />
                                <div>
                                    <p className="text-slate-800 dark:text-slate-200">{prompt.text}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">Suggestion based on: {prompt.reason}</p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            );
        }

        const prompts = SPEAKING_PROMPTS[activeTab];
        return (
             <div className="space-y-3">
                {prompts.map((prompt, index) => (
                    <button
                        key={index}
                        onClick={() => setSelectedPrompt(prompt)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-150 ${
                            selectedPrompt === prompt
                            ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500 shadow-md'
                            : 'bg-slate-50 dark:bg-slate-700/50 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        <div className="flex items-start">
                            <SpeakingIcon className={`h-5 w-5 mt-0.5 mr-3 flex-shrink-0 ${selectedPrompt === prompt ? 'text-blue-500' : 'text-slate-400'}`} />
                            <span className="text-slate-800 dark:text-slate-200">{prompt}</span>
                        </div>
                    </button>
                ))}
            </div>
        );
    };

    const TABS: PromptPart[] = ['Suggested', 'Part 1', 'Part 2', 'Part 3'];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Select a Speaking Prompt">
            <div className="flex flex-col h-[70vh]">
                <div role="tablist" className="flex-shrink-0 flex border-b border-slate-200 dark:border-slate-700 mb-4">
                    {TABS.map(part => {
                        if (part === 'Suggested' && !hasSuggestions && !isLoadingSuggestions) return null;
                        return (
                            <button
                                key={part}
                                role="tab"
                                aria-selected={activeTab === part}
                                onClick={() => {
                                    setActiveTab(part);
                                    setSelectedPrompt(null); // Reset selection when changing tabs
                                }}
                                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                                    activeTab === part
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                {part}
                                {part === 'Suggested' && <span className="ml-1.5 text-xs bg-amber-400 text-amber-900 font-bold px-1.5 py-0.5 rounded-full">AI</span>}
                            </button>
                        )
                    })}
                </div>
                <div className="flex-grow overflow-y-auto pr-2">
                    {renderPromptList()}
                </div>
                <div className="flex-shrink-0 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSelect} disabled={!selectedPrompt}>
                        Start with this Prompt
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default PromptSelectionModal;