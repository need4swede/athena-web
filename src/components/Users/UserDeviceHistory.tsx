import React, { useState, useEffect } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useAuth } from '../sso/SSOProvider';
import { FileText, ArrowRight, ArrowLeft } from 'lucide-react';

interface UserDeviceHistoryProps {
    studentId: number;
}

interface HistoryEvent {
    id: number;
    event_type: 'Check-Out' | 'Check-In';
    event_date: string;
    notes: string | null;
    asset_tag: string;
    model: string;
    admin_name: string | null;
    admin_email: string | null;
}

const UserDeviceHistory: React.FC<UserDeviceHistoryProps> = ({ studentId }) => {
    const [history, setHistory] = useState<HistoryEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { token } = useAuth();

    useEffect(() => {
        const fetchHistory = async () => {
            if (!token) return;
            setLoading(true);
            try {
                const response = await fetch(`/api/students/history/${studentId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch user device history');
                }
                const data = await response.json();
                setHistory(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [studentId, token]);

    const getEventIcon = (eventType: HistoryEvent['event_type']) => {
        switch (eventType) {
            case 'Check-Out':
                return <ArrowRight className="h-5 w-5 text-green-500" />;
            case 'Check-In':
                return <ArrowLeft className="h-5 w-5 text-blue-500" />;
            default:
                return <FileText className="h-5 w-5 text-gray-500" />;
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Device History</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96">
                    {loading ? (
                        <p>Loading device history...</p>
                    ) : error ? (
                        <p>Error: {error}</p>
                    ) : history.length > 0 ? (
                        <div className="space-y-6">
                            {history.map((event) => (
                                <div key={event.id} className="flex items-start gap-4 p-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full">
                                        {getEventIcon(event.event_type)}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="flex justify-between items-center">
                                            <p className="font-semibold text-lg">{event.event_type}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(event.event_date).toLocaleString()}</p>
                                        </div>
                                        <div className="mt-2">
                                            <p><span className="font-medium">Asset Tag:</span> {event.asset_tag}</p>
                                            <p><span className="font-medium">Model:</span> {event.model}</p>
                                            {event.admin_name && <p><span className="font-medium">Admin:</span> {event.admin_name} ({event.admin_email})</p>}
                                            {event.notes && <p className="text-sm text-gray-500 mt-1">Notes: {event.notes}</p>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>No device history found for this user.</p>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default UserDeviceHistory;
