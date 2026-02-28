import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

type Announcement = {
    id: string;
    message: string;
    createdAt: string;
};

const AnnouncementBanner: React.FC = () => {
    const { getAuthHeaders, isAuthenticated } = useAuth();
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);

    useEffect(() => {
        const fetchLatestAnnouncement = async () => {
            if (!isAuthenticated()) return;

            try {
                const res = await fetch('/api/announcements/latest', {
                    headers: getAuthHeaders()
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.announcement) {
                        setAnnouncement(data.announcement);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch announcement:', err);
            }
        };

        fetchLatestAnnouncement();
    }, [getAuthHeaders, isAuthenticated]);

    if (!announcement) return null;

    return (
        <div className="bg-indigo-600 text-white px-4 py-3 shadow-md border-b border-indigo-700 relative z-50">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <span className="flex p-1 rounded-full bg-indigo-500">
                        <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </span>
                    <p className="font-medium text-sm sm:text-base">
                        <span className="font-bold mr-2">Announcement:</span>
                        {announcement.message}
                    </p>
                </div>
                <button
                    onClick={() => setAnnouncement(null)}
                    className="-mr-1 flex p-1 rounded-md hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-white sm:-mr-2 transition-colors"
                >
                    <span className="sr-only">Dismiss</span>
                    <svg className="h-5 w-5 text-indigo-200 hover:text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default AnnouncementBanner;
