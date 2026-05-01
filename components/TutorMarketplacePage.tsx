import React, { useEffect, useState } from 'react';
import Card from './Card';
import Loader from './Loader';
import EmptyState from './ui/EmptyState';
import { tutorService, TutorProfile, TutorBooking } from '../services/practiceMoreService';
import { useToast } from './ui/Toast';

const TutorMarketplacePage: React.FC = () => {
    const { toast } = useToast();
    const [tutors, setTutors] = useState<TutorProfile[] | null>(null);
    const [bookings, setBookings] = useState<TutorBooking[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const refresh = () => {
        Promise.all([tutorService.list(), tutorService.bookings()])
            .then(([t, b]) => {
                setTutors(t.results || []);
                setBookings(b.results || []);
            })
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load tutor marketplace.'));
    };

    useEffect(() => { refresh(); }, []);

    const handleBook = async (tutor: TutorProfile) => {
        setBusyId(tutor.id);
        try {
            const next = new Date();
            next.setDate(next.getDate() + 1);
            next.setHours(18, 0, 0, 0);
            await tutorService.book(tutor.id, next.toISOString(), 30);
            toast({ kind: 'success', title: 'Booking requested', body: `${tutor.name} will confirm shortly.` });
            refresh();
        } catch (e) {
            toast({ kind: 'error', title: 'Booking failed', body: e instanceof Error ? e.message : 'Try again' });
        } finally {
            setBusyId(null);
        }
    };

    const handleAction = async (id: string, action: 'confirm' | 'cancel') => {
        setBusyId(id);
        try {
            await tutorService.bookingAction(id, action);
            toast({ kind: 'success', title: action === 'confirm' ? 'Booking confirmed' : 'Booking cancelled' });
            refresh();
        } catch (e) {
            toast({ kind: 'error', title: 'Action failed', body: e instanceof Error ? e.message : 'Try again' });
        } finally {
            setBusyId(null);
        }
    };

    if (error) {
        return <Card><div role="alert" className="text-red-500">{error}</div></Card>;
    }
    if (!tutors || !bookings) {
        return <Card><Loader text="Loading tutors…" /></Card>;
    }

    return (
        <div className="space-y-6">
            <Card>
                <h2 className="text-2xl font-bold">1-on-1 Tutors</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
                    Book a live human tutor for personalized speaking and writing feedback.
                </p>
                {tutors.length === 0 ? (
                    <EmptyState title="No tutors available" body="Check back soon — new tutors are onboarded weekly." />
                ) : (
                    <ul className="space-y-3">
                        {tutors.map(t => (
                            <li key={t.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold">{t.name}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            {t.languages?.join(' · ')} · {t.specialities?.join(', ')}
                                        </p>
                                        {t.bio && <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{t.bio}</p>}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-bold">${(t.hourly_rate_cents / 100).toFixed(0)}/hr</p>
                                        {typeof t.rating === 'number' && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400">★ {t.rating.toFixed(1)}</p>
                                        )}
                                        <button
                                            onClick={() => handleBook(t)}
                                            disabled={busyId === t.id}
                                            className="mt-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-3 py-1.5 rounded-md"
                                        >
                                            {busyId === t.id ? 'Booking…' : 'Book 30 min'}
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-3">Your bookings</h3>
                {bookings.length === 0 ? (
                    <EmptyState title="No bookings yet" body="Pick a tutor above to schedule a session." />
                ) : (
                    <ul className="space-y-2">
                        {bookings.map(b => (
                            <li key={b.id} className="flex items-center justify-between gap-3 p-3 rounded border border-slate-200 dark:border-slate-800">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{b.tutor_name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {new Date(b.scheduled_at).toLocaleString()} · {b.duration_minutes} min · {b.status}
                                    </p>
                                </div>
                                {b.status === 'requested' && (
                                    <button
                                        onClick={() => handleAction(b.id, 'cancel')}
                                        disabled={busyId === b.id}
                                        className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline shrink-0"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
};

export default TutorMarketplacePage;
