import { useEffect, useRef, useMemo } from 'react';
import { sanitizeCSS, type CSSValidationOptions } from '@/lib/css-sanitizer';

export interface UseCustomCSSOptions extends CSSValidationOptions {
    /**
     * Whether to enable custom CSS injection
     */
    enabled?: boolean;

    /**
     * Callback for handling CSS validation errors
     */
    onError?: (errors: string[]) => void;

    /**
     * Callback for handling CSS validation warnings
     */
    onWarning?: (warnings: string[]) => void;

    /**
     * Whether to log validation results to console (development only)
     */
    debug?: boolean;
}

export interface UseCustomCSSResult {
    /**
     * Whether the CSS was successfully applied
     */
    isApplied: boolean;

    /**
     * Whether the CSS is currently being processed
     */
    isLoading: boolean;

    /**
     * Any errors that occurred during CSS processing
     */
    errors: string[];

    /**
     * Any warnings from CSS validation
     */
    warnings: string[];

    /**
     * The sanitized CSS that was applied
     */
    sanitizedCSS: string;
}

/**
 * Custom hook for safely injecting and managing custom CSS
 *
 * Features:
 * - Automatic CSS sanitization and validation
 * - Scoped CSS injection to prevent global conflicts
 * - Automatic cleanup on component unmount
 * - Error handling and validation feedback
 * - Development debugging support
 *
 * @param css - The CSS string to inject
 * @param options - Configuration options for CSS processing
 * @returns Object containing application state and validation results
 */
export function useCustomCSS(
    css: string | undefined | null,
    options: UseCustomCSSOptions = {}
): UseCustomCSSResult {
    const {
        enabled = true,
        onError,
        onWarning,
        debug = process.env.NODE_ENV === 'development',
        ...sanitizeOptions
    } = options;

    // Refs for managing the injected style element
    const styleElementRef = useRef<HTMLStyleElement | null>(null);
    const lastCSSRef = useRef<string>('');

    // Memoize the sanitization result to avoid unnecessary re-processing
    const sanitizationResult = useMemo(() => {
        if (!css || !enabled) {
            return {
                isValid: false,
                sanitizedCSS: '',
                errors: [],
                warnings: []
            };
        }

        const result = sanitizeCSS(css, {
            scopePrefix: '.sso-login-container',
            strictMode: true,
            ...sanitizeOptions
        });

        // Debug logging in development
        if (debug) {
            console.group('🎨 Custom CSS Validation');
            console.log('Original CSS:', css);
            console.log('Sanitized CSS:', result.sanitizedCSS);
            console.log('Is Valid:', result.isValid);
            if (result.errors.length > 0) {
                console.warn('Errors:', result.errors);
            }
            if (result.warnings.length > 0) {
                console.warn('Warnings:', result.warnings);
            }
            console.groupEnd();
        }

        return result;
    }, [css, enabled, debug, sanitizeOptions]);

    // Handle validation callbacks
    useEffect(() => {
        if (sanitizationResult.errors.length > 0 && onError) {
            onError(sanitizationResult.errors);
        }
        if (sanitizationResult.warnings.length > 0 && onWarning) {
            onWarning(sanitizationResult.warnings);
        }
    }, [sanitizationResult.errors, sanitizationResult.warnings, onError, onWarning]);

    // Main effect for CSS injection and cleanup
    useEffect(() => {
        // Skip if disabled or no valid CSS
        if (!enabled || !sanitizationResult.isValid || !sanitizationResult.sanitizedCSS) {
            return;
        }

        // Skip if CSS hasn't changed
        if (sanitizationResult.sanitizedCSS === lastCSSRef.current) {
            return;
        }

        // Remove existing style element if it exists
        if (styleElementRef.current) {
            try {
                document.head.removeChild(styleElementRef.current);
                styleElementRef.current = null;
            } catch (error) {
                console.warn('Failed to remove existing custom CSS:', error);
            }
        }

        try {
            // Create new style element
            const styleElement = document.createElement('style');
            styleElement.type = 'text/css';
            styleElement.setAttribute('data-custom-css', 'sso-login');
            styleElement.textContent = sanitizationResult.sanitizedCSS;

            // Add to document head
            document.head.appendChild(styleElement);

            // Store reference for cleanup
            styleElementRef.current = styleElement;
            lastCSSRef.current = sanitizationResult.sanitizedCSS;

            if (debug) {
                console.log('✅ Custom CSS applied successfully');
            }

        } catch (error) {
            console.error('Failed to inject custom CSS:', error);

            // Call error callback if provided
            if (onError) {
                onError([`CSS injection failed: ${error instanceof Error ? error.message : 'Unknown error'}`]);
            }
        }

        // Cleanup function
        return () => {
            if (styleElementRef.current) {
                try {
                    document.head.removeChild(styleElementRef.current);
                    styleElementRef.current = null;
                    lastCSSRef.current = '';

                    if (debug) {
                        console.log('🧹 Custom CSS cleaned up');
                    }
                } catch (error) {
                    console.warn('Failed to cleanup custom CSS:', error);
                }
            }
        };
    }, [enabled, sanitizationResult.isValid, sanitizationResult.sanitizedCSS, debug, onError]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (styleElementRef.current) {
                try {
                    document.head.removeChild(styleElementRef.current);
                } catch (error) {
                    // Ignore errors during unmount cleanup
                }
            }
        };
    }, []);

    return {
        isApplied: enabled && sanitizationResult.isValid && !!styleElementRef.current,
        isLoading: false, // CSS injection is synchronous
        errors: sanitizationResult.errors,
        warnings: sanitizationResult.warnings,
        sanitizedCSS: sanitizationResult.sanitizedCSS
    };
}

/**
 * Utility hook for simple CSS injection without validation callbacks
 *
 * @param css - The CSS string to inject
 * @param enabled - Whether to enable CSS injection
 * @returns Whether the CSS was successfully applied
 */
export function useSimpleCustomCSS(css: string | undefined | null, enabled = true): boolean {
    const { isApplied } = useCustomCSS(css, { enabled });
    return isApplied;
}
