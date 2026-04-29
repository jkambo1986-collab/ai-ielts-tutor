/**
 * @file A modal component for selecting IELTS Writing Task 2 prompts.
 * It displays standard prompts and AI-powered suggestions based on user context.
 */
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import Loader from './Loader';
import { WritingIcon } from './Icons';
import { ContextualWritingPrompt } from '../types';

interface WritingPromptSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectPrompt: (prompt: string) => void;
    standardPrompts: string[];
    suggestedPrompts: ContextualWritingPrompt[];
    isLoadingSuggestions: boolean;
}

const WritingPromptSelectionModal: React.FC<WritingPromptSelectionModalProps> = ({
    isOpen,
    onClose,
    onSelectPrompt,
    standardPrompts,
    suggestedPrompts,
    isLoadingSuggestions
}) => {
    const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'Suggested' | 'Standard'>('Suggested');
    
    const hasSuggestions = suggestedPrompts.length > 0;

    useEffect(() => {
        if (isOpen) {
            setSelectedPrompt(null);
            setActiveTab(hasSuggestions || isLoadingSuggestions ? 'Suggested' : 'Standard');
        }
    }, [isOpen, hasSuggestions, isLoadingSuggestions]);


    const handleSelect = () => {
        if (selectedPrompt) {
            onSelectPrompt(selectedPrompt);
            onClose();
        }
    };

    const renderContent = () => {
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
                                <WritingIcon className={`h-5 w-5 mt-0.5 mr-3 flex-shrink-0 ${selectedPrompt === prompt.text ? 'text-blue-500' : 'text-slate-400'}`} />
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

        return (
            <div className="space-y-3">
                {standardPrompts.map((prompt, index) => (
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
                            <WritingIcon className={`h-5 w-5 mt-0.5 mr-3 flex-shrink-0 ${selectedPrompt === prompt ? 'text-blue-500' : 'text-slate-400'}`} />
                            <span className="text-slate-800 dark:text-slate-200">{prompt}</span>
                        </div>
                    </button>
                ))}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Select a Writing Prompt">
            <div className="flex flex-col h-[70vh]">
                 <div role="tablist" className="flex-shrink-0 flex border-b border-slate-200 dark:border-slate-700 mb-4">
                     {(['Suggested', 'Standard'] as const).map(tab => (
                          <button
                            key={tab}
                            role="tab"
                            aria-selected={activeTab === tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                                activeTab === tab
                                ? 'border-blue-500 text-blue-500'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            {tab}
                             {tab === 'Suggested' && <span className="ml-1.5 text-xs bg-amber-400 text-amber-900 font-bold px-1.5 py-0.5 rounded-full">AI</span>}
                        </button>
                     ))}
                </div>
                <div className="flex-grow overflow-y-auto pr-2">
                    {renderContent()}
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

export default WritingPromptSelectionModal;