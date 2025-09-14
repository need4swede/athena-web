/**
 * CSS Sanitizer - Professional security-first CSS sanitization utility
 * Prevents XSS attacks and malicious CSS injection while allowing safe styling
 */

// Whitelist of safe CSS properties
const ALLOWED_CSS_PROPERTIES = new Set([
    // Layout & Box Model
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'box-sizing', 'overflow', 'overflow-x', 'overflow-y', 'visibility',

    // Typography
    'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration',
    'text-transform', 'text-indent', 'text-shadow', 'white-space', 'word-wrap',
    'word-break', 'hyphens',

    // Colors & Backgrounds
    'color', 'background', 'background-color', 'background-image', 'background-repeat',
    'background-position', 'background-size', 'background-attachment', 'background-clip',
    'background-origin', 'opacity',

    // Borders & Outlines
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-width', 'border-style', 'border-color', 'border-radius',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius',
    'border-bottom-right-radius', 'outline', 'outline-color', 'outline-style',
    'outline-width', 'outline-offset',

    // Flexbox & Grid
    'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'justify-content',
    'align-items', 'align-content', 'align-self', 'flex-grow', 'flex-shrink',
    'flex-basis', 'order', 'grid', 'grid-template', 'grid-template-columns',
    'grid-template-rows', 'grid-gap', 'gap', 'row-gap', 'column-gap',

    // Transforms & Animations (limited)
    'transform', 'transform-origin', 'transition', 'transition-property',
    'transition-duration', 'transition-timing-function', 'transition-delay',

    // Misc
    'cursor', 'pointer-events', 'user-select', 'box-shadow', 'filter',
    'backdrop-filter', 'clip-path'
]);

// Dangerous CSS functions and values to block
const DANGEROUS_PATTERNS = [
    /javascript:/gi,
    /expression\s*\(/gi,
    /url\s*\(\s*["']?\s*javascript:/gi,
    /url\s*\(\s*["']?\s*data:/gi,
    /url\s*\(\s*["']?\s*vbscript:/gi,
    /url\s*\(\s*["']?\s*file:/gi,
    /import\s*["']/gi,
    /@import/gi,
    /binding\s*:/gi,
    /behavior\s*:/gi,
    /expression\s*:/gi,
    /moz-binding/gi,
    /-webkit-binding/gi,
    /xbl:/gi
];

// Maximum allowed CSS size (10KB)
const MAX_CSS_SIZE = 10 * 1024;

export interface CSSValidationResult {
    isValid: boolean;
    sanitizedCSS: string;
    errors: string[];
    warnings: string[];
}

export interface CSSValidationOptions {
    maxSize?: number;
    allowedProperties?: string[];
    scopePrefix?: string;
    strictMode?: boolean;
}

/**
 * Sanitizes CSS input to prevent XSS and other security issues
 */
export function sanitizeCSS(
    css: string,
    options: CSSValidationOptions = {}
): CSSValidationResult {
    const {
        maxSize = MAX_CSS_SIZE,
        allowedProperties = Array.from(ALLOWED_CSS_PROPERTIES),
        scopePrefix = '.sso-login-container',
        strictMode = true
    } = options;

    const errors: string[] = [];
    const warnings: string[] = [];
    let sanitizedCSS = '';

    try {
        // Input validation
        if (!css || typeof css !== 'string') {
            errors.push('CSS input must be a non-empty string');
            return { isValid: false, sanitizedCSS: '', errors, warnings };
        }

        // Size validation
        if (css.length > maxSize) {
            errors.push(`CSS size exceeds maximum allowed size of ${maxSize} bytes`);
            return { isValid: false, sanitizedCSS: '', errors, warnings };
        }

        // Check for dangerous patterns
        for (const pattern of DANGEROUS_PATTERNS) {
            if (pattern.test(css)) {
                errors.push(`Dangerous CSS pattern detected: ${pattern.source}`);
                if (strictMode) {
                    return { isValid: false, sanitizedCSS: '', errors, warnings };
                }
            }
        }

        // Basic CSS parsing and sanitization
        sanitizedCSS = parseCSSRules(css, allowedProperties, scopePrefix, warnings);

        // Final validation
        if (!sanitizedCSS.trim()) {
            warnings.push('No valid CSS rules found after sanitization');
        }

        return {
            isValid: errors.length === 0,
            sanitizedCSS,
            errors,
            warnings
        };

    } catch (error) {
        errors.push(`CSS parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return { isValid: false, sanitizedCSS: '', errors, warnings };
    }
}

/**
 * Parses CSS rules and applies security filters
 */
function parseCSSRules(
    css: string,
    allowedProperties: string[],
    scopePrefix: string,
    warnings: string[]
): string {
    const allowedPropsSet = new Set(allowedProperties.map(p => p.toLowerCase()));
    const sanitizedRules: string[] = [];

    // Remove comments first
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // Split into rules (basic parsing)
    const rules = css.split('}').filter(rule => rule.trim());

    for (const rule of rules) {
        const trimmedRule = rule.trim();
        if (!trimmedRule) continue;

        const [selectorPart, declarationsPart] = trimmedRule.split('{');
        if (!selectorPart || !declarationsPart) continue;

        const selector = selectorPart.trim();
        const declarations = declarationsPart.trim();

        // Sanitize selector
        const sanitizedSelector = sanitizeSelector(selector, scopePrefix, warnings);
        if (!sanitizedSelector) continue;

        // Sanitize declarations
        const sanitizedDeclarations = sanitizeDeclarations(
            declarations,
            allowedPropsSet,
            warnings
        );

        if (sanitizedDeclarations.trim()) {
            sanitizedRules.push(`${sanitizedSelector} { ${sanitizedDeclarations} }`);
        }
    }

    return sanitizedRules.join('\n');
}

/**
 * Sanitizes CSS selectors and applies scoping
 */
function sanitizeSelector(selector: string, scopePrefix: string, warnings: string[]): string {
    // Remove dangerous characters and patterns
    const cleanSelector = selector
        .replace(/[<>]/g, '') // Remove HTML-like characters
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/expression\s*\(/gi, '') // Remove expression()
        .trim();

    if (!cleanSelector) {
        warnings.push(`Invalid selector removed: ${selector}`);
        return '';
    }

    // Apply scoping - prefix all selectors with the scope
    const scopedSelectors = cleanSelector
        .split(',')
        .map(s => {
            const trimmed = s.trim();
            if (!trimmed) return '';

            // Don't double-scope if already scoped
            if (trimmed.startsWith(scopePrefix)) {
                return trimmed;
            }

            // Add scope prefix
            return `${scopePrefix} ${trimmed}`;
        })
        .filter(s => s)
        .join(', ');

    return scopedSelectors;
}

/**
 * Sanitizes CSS declarations (property-value pairs)
 */
function sanitizeDeclarations(
    declarations: string,
    allowedProperties: Set<string>,
    warnings: string[]
): string {
    const sanitizedDeclarations: string[] = [];

    // Split declarations by semicolon
    const declarationList = declarations.split(';').filter(d => d.trim());

    for (const declaration of declarationList) {
        const [property, ...valueParts] = declaration.split(':');
        if (!property || valueParts.length === 0) continue;

        const cleanProperty = property.trim().toLowerCase();
        const value = valueParts.join(':').trim();

        // Check if property is allowed
        if (!allowedProperties.has(cleanProperty)) {
            warnings.push(`Disallowed CSS property removed: ${cleanProperty}`);
            continue;
        }

        // Sanitize value
        const sanitizedValue = sanitizeValue(value, warnings);
        if (!sanitizedValue) continue;

        sanitizedDeclarations.push(`${cleanProperty}: ${sanitizedValue}`);
    }

    return sanitizedDeclarations.join('; ');
}

/**
 * Sanitizes CSS values
 */
function sanitizeValue(value: string, warnings: string[]): string {
    // Check for dangerous patterns in values
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(value)) {
            warnings.push(`Dangerous CSS value removed: ${value}`);
            return '';
        }
    }

    // Remove potentially dangerous characters
    const cleanValue = value
        .replace(/[<>]/g, '') // Remove HTML-like characters
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/expression\s*\(/gi, '') // Remove expression()
        .trim();

    return cleanValue;
}

/**
 * Validates if a CSS string is safe for injection
 */
export function isCSSSafe(css: string): boolean {
    const result = sanitizeCSS(css);
    return result.isValid && result.errors.length === 0;
}

/**
 * Quick sanitization for simple CSS strings
 */
export function quickSanitizeCSS(css: string, scopePrefix = '.sso-login-container'): string {
    const result = sanitizeCSS(css, { scopePrefix, strictMode: false });
    return result.sanitizedCSS;
}
