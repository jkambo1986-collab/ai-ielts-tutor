/**
 * @file A reusable, accessible modal component for displaying content in an overlay.
 */

import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store the element that opened the modal to return focus to it later
      triggerRef.current = document.activeElement;

      // Focus the first focusable element inside the modal
      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      // FIX: Add type guard to ensure the element is focusable.
      const firstElement = focusableElements?.[0];
      if (firstElement instanceof HTMLElement) {
        firstElement.focus();
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        // Close modal on Escape key press
        if (event.key === 'Escape') {
          onClose();
        }

        // Trap focus inside the modal
        if (event.key === 'Tab' && modalRef.current) {
          const focusableElements = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ));
          if (focusableElements.length === 0) return;

          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (event.shiftKey) { // Shift + Tab
            if (document.activeElement === firstElement) {
              // FIX: Add type guard before calling focus.
              if (lastElement instanceof HTMLElement) {
                  lastElement.focus();
              }
              event.preventDefault();
            }
          } else { // Tab
            if (document.activeElement === lastElement) {
              // FIX: Add type guard before calling focus.
              if (firstElement instanceof HTMLElement) {
                  firstElement.focus();
              }
              event.preventDefault();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      
      // Cleanup function
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        // Return focus to the element that opened the modal
        // FIX: Add type guard as Element type does not guarantee a focus method.
        if (triggerRef.current instanceof HTMLElement) {
          triggerRef.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex justify-center items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl m-4 transform transition-all"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id="modal-title" className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full p-1"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
