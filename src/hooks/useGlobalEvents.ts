import { useEffect, useRef } from 'react';

// Global event emitter for cross-component communication
class GlobalEventEmitter {
    private listeners: { [key: string]: Function[] } = {};

    on(event: string, callback: Function) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event: string, callback: Function) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event: string, data?: any) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
    }
}

// Global singleton instance
const globalEvents = new GlobalEventEmitter();

// Hook for emitting events
export const useEventEmitter = () => {
    return {
        emit: (event: string, data?: any) => globalEvents.emit(event, data)
    };
};

// Hook for listening to events
export const useEventListener = (event: string, callback: Function) => {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const handler = (data: any) => callbackRef.current(data);

        globalEvents.on(event, handler);

        return () => globalEvents.off(event, handler);
    }, [event]);
};

// Predefined event types for type safety
export const GLOBAL_EVENTS = {
    DEVICES_AUTO_POPULATED: 'devices-auto-populated',
    STUDENTS_AUTO_POPULATED: 'students-auto-populated',
    CHROMEBOOKS_REFRESH_NEEDED: 'chromebooks-refresh-needed',
    USERS_REFRESH_NEEDED: 'users-refresh-needed'
} as const;
