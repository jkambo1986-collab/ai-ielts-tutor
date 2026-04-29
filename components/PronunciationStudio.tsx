/**
 * @file The component for the interactive Pronunciation Studio.
 * It generates targeted exercises for a specific pronunciation error and provides
 * a record-and-compare interface for practice.
 */

import React, { useState, useEffect, useRef } from 'react';
import { PronunciationDetail, PronunciationPractice } from '../types';
import { generatePronunciationPractice } from '../services/geminiService';
import Loader from './Loader';
import { SpeakingIcon, ListeningIcon, StopIcon } from './Icons';

interface PronunciationStudioProps {
    analysis: PronunciationDetail;
}

/**
 * The main component for the Pronunciation Studio modal.
 * @param {PronunciationStudioProps} props - The component props, including the specific error to practice.
 * @returns {React.FC} The rendered Pronunciation Studio.
 */
const PronunciationStudio: React.FC<PronunciationStudioProps> = ({ analysis }) => {
    const [practice, setPractice] = useState<PronunciationPractice | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch targeted exercises when the component mounts with a specific analysis.
    useEffect(() => {
        const fetchPractice = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const practiceData = await generatePronunciationPractice(analysis);
                setPractice(practiceData);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load practice exercises.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchPractice();
    }, [analysis]);

    if (isLoading) {
        return <Loader text="Generating targeted exercises..." />;
    }

    if (error) {
        return <div className="text-red-500 text-center p-4" role="alert">{error}</div>;
    }

    if (!practice) {
        return <div className="text-slate-500 text-center p-4">No practice material available.</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold">Practice Area: <span className="text-blue-500">{practice.targetPhoneme}</span></h3>
                <p className="text-slate-600 dark:text-slate-400">{analysis.explanation}</p>
            </div>
            
            {practice.minimalPairs.length > 0 && (
                <div>
                    <h4 className="font-semibold mb-2">Minimal Pairs</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Listen to the difference, then record yourself.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {practice.minimalPairs.map((pair, index) => (
                            <PracticeItem key={index} text={`${pair.wordA} / ${pair.wordB}`} />
                        ))}
                    </div>
                </div>
            )}

            {practice.tongueTwisters.length > 0 && (
                <div>
                    <h4 className="font-semibold mb-2">Tongue Twisters</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Try saying these quickly and clearly.</p>
                    <div className="space-y-4">
                        {practice.tongueTwisters.map((twister, index) => (
                            <PracticeItem key={index} text={twister} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * A sub-component for a single interactive practice item (e.g., a minimal pair or tongue twister).
 * It handles text-to-speech for listening and microphone recording for user practice.
 * @param {{ text: string }} props - The text of the practice item.
 * @returns {React.FC} The rendered practice item.
 */
const PracticeItem: React.FC<{ text: string }> = ({ text }) => {
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [audioURL, setAudioURL] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const handleListen = () => {
        if (!('speechSynthesis' in window)) {
            alert('Your browser does not support text-to-speech.');
            return;
        }
        window.speechSynthesis.cancel(); // Cancel any ongoing speech
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    };

    const handleRecord = async () => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorderRef.current = new MediaRecorder(stream);
                audioChunksRef.current = [];
                setAudioURL(null);

                mediaRecorderRef.current.ondataavailable = (event) => {
                    audioChunksRef.current.push(event.data);
                };

                mediaRecorderRef.current.onstop = () => {
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    const url = URL.createObjectURL(audioBlob);
                    setAudioURL(url);
                    // Stop mic stream tracks to turn off the recording indicator
                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorderRef.current.start();
                setIsRecording(true);
            } catch (err) {
                console.error("Error starting recording:", err);
                alert("Could not start recording. Please ensure you have given microphone permissions.");
            }
        }
    };
    
    // Clean up object URLs to prevent memory leaks
    useEffect(() => {
        return () => {
            if (audioURL) {
                URL.revokeObjectURL(audioURL);
            }
        };
    }, [audioURL]);

    return (
        <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg flex items-center justify-between gap-4">
            <p className="font-mono text-lg text-slate-800 dark:text-slate-200 flex-grow">{text}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
                <IconButton aria-label="Listen to AI pronunciation" onClick={handleListen}>
                    <ListeningIcon className="h-5 w-5" />
                </IconButton>
                <IconButton
                    aria-label={isRecording ? 'Stop recording' : 'Record your voice'}
                    onClick={handleRecord}
                    className={isRecording ? 'bg-red-500 text-white hover:bg-red-600' : ''}
                >
                    {isRecording ? <StopIcon className="h-5 w-5" /> : <SpeakingIcon className="h-5 w-5" />}
                </IconButton>
                {audioURL && (
                    <audio src={audioURL} controls className="h-8 max-w-[150px]"></audio>
                )}
            </div>
        </div>
    );
};

/**
 * A reusable, styled icon button component.
 */
const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className, ...props }) => (
    <button
        className={`p-2 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        {...props}
    >
        {children}
    </button>
);

export default PronunciationStudio;
