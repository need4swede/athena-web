import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { validateJwtSecretOrExit } from './utils/jwt';
import { connectToDatabase } from './database';
import { getDatabaseTimestamp } from './utils/timezone';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { userRoutes } from './routes/users';
import { chromebookRoutes } from './routes/chromebooks';
import { dashboardRoutes } from './routes/dashboard';
import googleApiRoutes from './routes/google-api';
import aeriesApiRoutes from './routes/aeries-api';
import { orgUnitsRoutes } from './routes/org-units';
import { checkinRoutes } from './routes/checkins';
import { studentRoutes } from './routes/students';
import { deviceHistoryRoutes } from './routes/device-history';
import { portalRoutes } from './routes/portal';
import receiptsRouter from './routes/receipts';
import sandboxRoutes from './routes/sandbox';
import { sandboxContext, blockExternalWritesInSandbox } from './middleware/sandbox';
import maintenanceRoutes from './routes/maintenance';
import searchRoutes from './routes/search';
import { feeRoutes } from './routes/fees';
import { paymentRoutes } from './routes/payments';
import { reportRoutes } from './routes/reports';
import ssoRoutes from './routes/sso';
import validationRoutes from './routes/validation';
import { checkoutRoutes } from './routes/checkouts';
import insuranceOverrideRoutes from './routes/insuranceOverride';
import dbAdminRoutes from './routes/db-admin';

// Load environment variables
dotenv.config();

// Enforce strong JWT secret in production
validateJwtSecretOrExit();

const app = express();
const PORT = process.env.PORT || 3002;

// Security middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs (increased for development)
    message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// CORS configuration using ALLOWED_ORIGINS (comma-separated)
const parseAllowedOrigins = (): string[] => {
    const set = new Set<string>();
    const preferred = process.env.FRONTEND_URL || 'http://localhost:5173';
    set.add(preferred);
    set.add('http://localhost:6464');
    const envList = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const o of envList) set.add(o);
    return Array.from(set);
};

const allowedOrigins = parseAllowedOrigins();
app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser requests or same-origin
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS not allowed for origin'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Logging
app.use(morgan('combined'));

// Body parsing middleware - increased limits for photo uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Attach sandbox context (best-effort) for all requests
app.use(sandboxContext);

// Serve static files from the 'files' directory with CORS headers
app.use('/files', (req, res, next) => {
    const origin = req.get('Origin');
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static('files'));

// Apply stricter rate limits to sensitive endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

// Debug middleware to log all requests (disabled in production)
if ((process.env.NODE_ENV || 'development') !== 'production') {
    app.use((req, res, next) => {
        console.log(`🔍 [DEBUG] ${req.method} ${req.originalUrl}`);
        // Avoid logging Authorization header for safety
        const { authorization, ...restHeaders } = req.headers as Record<string, any>;
        console.log(`🔍 [DEBUG] Headers:`, JSON.stringify(restHeaders, null, 2));
        if (req.body && Object.keys(req.body).length > 0) {
            console.log(`🔍 [DEBUG] Body:`, JSON.stringify(req.body, null, 2));
        }
        next();
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: getDatabaseTimestamp(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
    });
});

// API routes with debugging
console.log('🔧 [DEBUG] Registering API routes...');
console.log('🔧 [DEBUG] Google API routes type:', typeof googleApiRoutes);
console.log('🔧 [DEBUG] Google API routes:', googleApiRoutes);

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chromebooks', chromebookRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/org-units', orgUnitsRoutes);
// Main checkout routes (granular checkout system)
app.use('/api/checkouts', checkoutRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/device-history', deviceHistoryRoutes);
app.use('/api/google', (req, res, next) => {
    console.log(`🔍 [GOOGLE API] ${req.method} ${req.originalUrl}`);
    next();
}, blockExternalWritesInSandbox, googleApiRoutes);
app.use('/api/aeries', (req, res, next) => {
    console.log(`🔍 [AERIES API] ${req.method} ${req.originalUrl}`);
    next();
}, blockExternalWritesInSandbox, aeriesApiRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/receipts', receiptsRouter);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/sso', ssoRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/insurance-override', insuranceOverrideRoutes);
app.use('/api/sandbox', sandboxRoutes);
app.use('/api/admin/db', adminLimiter, dbAdminRoutes);

// 404 handler
app.use('*', (req, res) => {
    console.log(`❌ [404] Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: getDatabaseTimestamp(),
    });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❌ [ERROR] Global error handler:', err);
    console.error('❌ [ERROR] Request:', req.method, req.originalUrl);
    console.error('❌ [ERROR] Headers:', req.headers);

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';

    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(isDevelopment && { stack: err.stack }),
        timestamp: getDatabaseTimestamp(),
    });
});

// Initialize database and start server
async function startServer() {
    try {
        console.log('🚀 Starting Chromebook Library Backend Server...');

        // Connect to database
        const dbConnected = await connectToDatabase();
        if (!dbConnected) {
            console.log('⚠️  Database connection failed, but starting server anyway for development');
            console.log('📝 Note: Database-dependent features will not work until PostgreSQL is available');
        }

        // Start the server
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);

            // Log registered routes for debugging
            console.log('🔧 [DEBUG] Registered routes:');
            app._router.stack.forEach((middleware: any) => {
                if (middleware.route) {
                    console.log(`  ${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
                } else if (middleware.name === 'router') {
                    console.log(`  Router: ${middleware.regexp}`);
                }
            });
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// Start the server
startServer();
