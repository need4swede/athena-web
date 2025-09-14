import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { formatDistanceToNow } from 'date-fns';

// Application timezone - should match the TZ environment variable
export const APP_TIMEZONE = 'America/Los_Angeles';

/**
 * Get the current date/time in the application timezone
 */
export function getCurrentDateTime(): Date {
    return new Date();
}

/**
 * Get the current date/time as an ISO string in UTC (for database storage)
 */
export function getCurrentDateTimeUTC(): string {
    return new Date().toISOString();
}

/**
 * Get the current date/time formatted for the application timezone
 */
export function getCurrentDateTimeFormatted(formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
    return formatInTimeZone(new Date(), APP_TIMEZONE, formatStr);
}

/**
 * Convert a UTC date to the application timezone
 */
export function utcToAppTimezone(utcDate: Date | string): Date {
    const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
    return toZonedTime(date, APP_TIMEZONE);
}

/**
 * Convert a date in the application timezone to UTC
 */
export function appTimezoneToUtc(localDate: Date): Date {
    return fromZonedTime(localDate, APP_TIMEZONE);
}

/**
 * Format a date for display in the application timezone
 */
export function formatDateForDisplay(
    date: Date | string,
    formatStr: string = 'MMM dd, yyyy HH:mm'
): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return formatInTimeZone(dateObj, APP_TIMEZONE, formatStr);
}

/**
 * Format a date for the Google Notes Service (YYYY-MM-DD HH:MM format in app timezone)
 */
export function formatDateForGoogleNotes(date: Date = new Date()): string {
    return formatInTimeZone(date, APP_TIMEZONE, 'yyyy-MM-dd HH:mm');
}

/**
 * Get a human-readable "time ago" string
 */
export function formatTimeAgo(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    try {
        return formatDistanceToNow(dateObj, { addSuffix: true });
    } catch (error) {
        console.error('Error formatting time ago:', error);
        return 'Unknown time';
    }
}

/**
 * Get the current timestamp for database operations (always UTC)
 */
export function getDatabaseTimestamp(): string {
    return getCurrentDateTimeUTC();
}

/**
 * Parse a database timestamp and convert to app timezone for display
 */
export function parseDatabaseTimestamp(timestamp: string): Date {
    return utcToAppTimezone(timestamp);
}

/**
 * Validate if a date string is valid
 */
export function isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
}

/**
 * Get timezone info for debugging
 */
export function getTimezoneInfo(): {
    appTimezone: string;
    currentUTC: string;
    currentLocal: string;
    offset: string;
} {
    const now = new Date();
    return {
        appTimezone: APP_TIMEZONE,
        currentUTC: now.toISOString(),
        currentLocal: formatInTimeZone(now, APP_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz'),
        offset: formatInTimeZone(now, APP_TIMEZONE, 'xxx')
    };
}
