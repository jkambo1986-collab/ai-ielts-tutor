/**
 * @file Modal shown when a student attempts a Pro-only feature.
 *
 * On this institution-managed platform, students cannot self-upgrade — Pro is
 * granted by the institute admin. The modal directs them to their admin
 * instead of offering a payment flow.
 */

import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { CheckIcon } from './Icons';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Optional callback for legacy callers (e.g. those that used to navigate to pricing). Currently unused. */
    onUpgrade?: () => void;
    featureName: string;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, featureName }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Pro Feature">
            <div className="text-center p-4">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/50 rounded-full mx-auto flex items-center justify-center mb-4">
                    <span className="text-3xl" role="img" aria-label="Sparkles">✨</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                    "{featureName}" is a Pro Feature
                </h3>
                <p className="mt-4 text-slate-600 dark:text-slate-400">
                    Pro features on this platform are enabled by your institute. Contact your institute administrator to request access. Pro unlocks:
                </p>
                <ul className="mt-6 text-left list-none space-y-3 inline-block">
                    <li className="flex items-center"><CheckIcon className="h-5 w-5 text-green-500 mr-3" /><span>Advanced AI Coach Analysis</span></li>
                    <li className="flex items-center"><CheckIcon className="h-5 w-5 text-green-500 mr-3" /><span>Personalized Weekly Study Plans</span></li>
                    <li className="flex items-center"><CheckIcon className="h-5 w-5 text-green-500 mr-3" /><span>Interactive Writing & Speaking Tools</span></li>
                    <li className="flex items-center"><CheckIcon className="h-5 w-5 text-green-500 mr-3" /><span>Integrated Skills Lab</span></li>
                </ul>
                <div className="mt-8 flex justify-center">
                    <Button onClick={onClose}>Got it</Button>
                </div>
            </div>
        </Modal>
    );
};

export default UpgradeModal;
