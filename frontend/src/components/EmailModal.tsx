import React, { useState } from 'react';

type EmailModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSend: (email: string, message: string) => Promise<void>;
    isSending: boolean;
};

const EmailModal: React.FC<EmailModalProps> = ({ isOpen, onClose, onSend, isSending }) => {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setError('Recipient email is required.');
            return;
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError('Please enter a valid email address.');
            return;
        }

        setError('');
        try {
            await onSend(email, message);
            // Wait for the onSend to finish, then clear and close if successful
            setEmail('');
            setMessage('');
            onClose();
        } catch (err: any) {
            // if onSend throws, we stay open to show error
            // The error message handle is passed down from the parent now usually
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-800 rounded-lg shadow-2xl max-w-md w-full border border-slate-700 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
                    <h3 className="text-xl font-bold font-serif text-slate-100 tracking-wide" id="modal-title">Email Contract PDF</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1"
                        aria-label="Close modal"
                        disabled={isSending}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 flex flex-col">
                    {error && <div className="text-sm text-red-400 bg-red-400/10 p-3 rounded border border-red-400/20">{error}</div>}

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Recipient Email</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isSending}
                            placeholder="e.g. musician@example.com"
                            className="mt-1 block w-full px-4 py-2 min-h-[44px] bg-slate-900 border border-slate-600 text-slate-50 transition-shadow rounded-md shadow-sm placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:text-sm appearance-none leading-normal"
                        />
                    </div>

                    <div>
                        <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">Message (Optional)</label>
                        <textarea
                            id="message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            disabled={isSending}
                            rows={4}
                            placeholder="Add a personal message to the email..."
                            className="mt-1 block w-full px-4 py-3 bg-slate-900 border border-slate-600 text-slate-50 transition-shadow rounded-md shadow-sm placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:text-sm"
                        />
                    </div>

                    <div className="pt-2 flex justify-end space-x-3 mt-auto">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSending}
                            className="px-4 py-2 text-sm font-medium text-slate-300 bg-transparent hover:bg-slate-700 hover:text-white rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSending}
                            className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-md transition-all shadow cursor-pointer flex items-center"
                        >
                            {isSending ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Sending...
                                </>
                            ) : 'Send Email'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EmailModal;
