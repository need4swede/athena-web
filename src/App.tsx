import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { SSOProvider, useAuth } from "@/components/sso/SSOProvider";
import { LoginPage } from "@/components/sso/LoginPage";
import { AdminDashboard } from "@/components/sso/AdminDashboard";
import { AuthCallback } from "./pages/AuthCallback";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import CheckoutPage from "./pages/CheckoutPage";
import CheckinPage from "./pages/CheckinPage";
import ReportsPage from "./pages/ReportsPage";
import TransactionReportPage from "./pages/TransactionReportPage";
import CurrentCheckoutsReportPage from "./pages/CurrentCheckoutsReportPage";
import MaintenancePage from "./pages/MaintenancePage";
import ChromebooksPage from "./pages/ChromebooksPage";
import OrgUnitsPage from "./pages/OrgUnitsPage";
import UsersPage from "./pages/UsersPage";
import MyDevicePage from "./pages/MyDevicePage";
import TasksPage from "./pages/TasksPage";
import DeviceMigrationPage from "./pages/DeviceMigrationPage";
import DeviceResetPage from "./pages/DeviceResetPage";
import AeriesPage from "./pages/AeriesPage";
import DbAdminPage from "./pages/DbAdminPage";
import { connectToDatabase } from "@/lib/database";
import { queryClient } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { SandboxProvider } from '@/components/Sandbox/SandboxProvider';
import { SandboxBanner } from '@/components/Sandbox/SandboxBanner';

function AppRouter() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Public routes that do not require authentication
  const publicRoutes = ['/mydevice'];

  if (publicRoutes.includes(location.pathname)) {
    return (
      <Routes>
        <Route path="/mydevice" element={<MyDevicePage />} />
      </Routes>
    );
  }

  // Handle OAuth callback route separately (before authentication check)
  if (location.pathname === '/auth/callback') {
    return <AuthCallback />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Helper functions for role checking
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const canViewUsers = user?.role === 'user' || user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/checkin" element={<CheckinPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/reports/transactions" element={<TransactionReportPage />} />
      <Route path="/reports/current-checkouts" element={<CurrentCheckoutsReportPage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="/chromebooks" element={<ChromebooksPage />} />
      <Route path="/org-units" element={isSuperAdmin ? <OrgUnitsPage /> : <NotFound />} />
      <Route path="/users" element={canViewUsers ? <UsersPage /> : <NotFound />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      {isSuperAdmin && <Route path="/admin" element={<AdminDashboard />} />}
      {isSuperAdmin && <Route path="/db-admin" element={<DbAdminPage />} />}
      {isAdmin && <Route path="/user-management" element={<Navigate to="/admin" replace />} />}
      {isAdmin && <Route path="/tasks" element={<TasksPage />} />}
      {isAdmin && <Route path="/tasks/device-migration" element={<DeviceMigrationPage />} />}
      {isAdmin && <Route path="/tasks/device-reset" element={<DeviceResetPage />} />}
      {isAdmin && <Route path="/aeries" element={<AeriesPage />} />}
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  const [dbInitialized, setDbInitialized] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      console.log('🚀 [App] Initializing application...');
      try {
        await connectToDatabase();
        console.log('✅ [App] Database initialized successfully');
        setDbInitialized(true);
      } catch (error) {
        console.error('❌ [App] Database initialization failed:', error);
        // Still allow the app to continue even if database init fails
        setDbInitialized(true);
      }
    };

    initializeApp();
  }, []);

  if (!dbInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Initializing database...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SSOProvider>
          <SandboxProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <AppRouter />
              <SandboxBanner />
            </TooltipProvider>
          </SandboxProvider>
        </SSOProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
