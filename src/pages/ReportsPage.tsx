
import React from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/sso/SSOProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ArrowRight, DollarSign, PieChart, List, BarChart, FileText } from 'lucide-react';

const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = React.useState('reports');

  const reports = [
    {
      id: 'transactions',
      title: 'Transaction Report',
      description: 'Report of all payments and fees',
      icon: DollarSign,
      path: '/reports/transactions',
      status: 'available'
    },
    {
      id: 'inventory',
      title: 'Inventory Status',
      description: 'Overview of all devices by status',
      icon: PieChart,
      path: '#',
      status: 'unavailable'
    },
    {
      id: 'checkouts',
      title: 'Current Checkouts',
      description: 'List of all checked out devices',
      icon: List,
      path: '#',
      status: 'unavailable'
    },
    {
      id: 'usage',
      title: 'Usage Statistics',
      description: 'Device utilization and checkout frequency',
      icon: BarChart,
      path: '#',
      status: 'unavailable'
    },
    {
      id: 'maintenance',
      title: 'Maintenance Report',
      description: 'Devices requiring maintenance or repair',
      icon: FileText,
      path: '#',
      status: 'unavailable'
    }
  ];

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50/80 dark:bg-black/80 transition-colors duration-300">
      <Header />
      <div className="flex">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          userRole={user?.role === 'super_admin' ? 'super-admin' : (user?.role as 'user' | 'admin') || 'user'}
        />
        <main className="flex-1 p-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Reports
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Generate and view reports about your Chromebook fleet
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.map((report) => {
                const Icon = report.icon;
                const isAvailable = report.status === 'available';
                const cardContent = (
                  <Card className={`hover:shadow-lg transition-shadow duration-200 ${isAvailable ? 'cursor-pointer group' : 'cursor-not-allowed opacity-50'}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                          <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        {isAvailable && <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />}
                      </div>
                      <CardTitle className="mt-4">{report.title}</CardTitle>
                      <CardDescription>{report.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isAvailable ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                          {isAvailable ? 'Available' : 'Coming Soon'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );

                if (isAvailable) {
                  return (
                    <Link key={report.id} to={report.path}>
                      {cardContent}
                    </Link>
                  );
                }
                return <div key={report.id}>{cardContent}</div>;
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
    </ThemeProvider>
  );
};

export default ReportsPage;
