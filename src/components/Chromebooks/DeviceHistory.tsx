import React, { useState, useEffect } from 'react';
import { DeviceHistoryEvent } from '../../types/deviceHistory';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useAuth } from '../sso/SSOProvider';
import { Printer, FileText, ArrowRight, ArrowLeft, Wrench, Archive } from 'lucide-react';

interface DeviceHistoryProps {
    chromebookId: number;
}

const DeviceHistory: React.FC<DeviceHistoryProps> = ({ chromebookId }) => {
    const [history, setHistory] = useState<DeviceHistoryEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { token } = useAuth();

    useEffect(() => {
        const fetchHistory = async () => {
            if (!token) return;
            setLoading(true);
            try {
                const response = await fetch(`/api/device-history/${chromebookId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch device history');
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
    }, [chromebookId, token]);

    const handlePrintAgreement = (checkoutId?: number) => {
        if (!checkoutId || !token) return;
        const url = `/api/checkouts/${checkoutId}/agreement?token=${token}`;
        window.open(url, '_blank');
    };

    const getEventIcon = (eventType: DeviceHistoryEvent['event_type']) => {
        switch (eventType) {
            case 'Check-Out':
                return <ArrowRight className="h-5 w-5 text-green-500" />;
            case 'Check-In':
                return <ArrowLeft className="h-5 w-5 text-blue-500" />;
            case 'Repair':
                return <Wrench className="h-5 w-5 text-yellow-500" />;
            case 'Retired':
                return <Archive className="h-5 w-5 text-red-500" />;
            default:
                return <FileText className="h-5 w-5 text-gray-500" />;
        }
    };

    if (loading) return <p>Loading device history...</p>;
    if (error) return <p>Error: {error}</p>;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Device History</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96">
                    {history.length > 0 ? (
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
                                            <p><span className="font-medium">Admin:</span> {event.admin_name} ({event.admin_email})</p>
                                            {event.student_first_name && <p><span className="font-medium">Student:</span> {event.student_first_name} {event.student_last_name} ({event.student_email})</p>}
                                            {event.notes && <p className="text-sm text-gray-500 mt-1">Notes: {event.notes}</p>}
                                        </div>
                                        {(event.event_type === 'Check-Out' || event.event_type === 'Check-In') && event.signature && (
                                            <div className="mt-4 flex justify-end">
                                                <Button variant="outline" size="sm" onClick={() => handlePrintAgreement(event.checkout_id)}>
                                                    <Printer className="h-4 w-4 mr-2" />
                                                    Print Agreement
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>No history found for this device.</p>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default DeviceHistory;
