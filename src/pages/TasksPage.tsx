import React from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/sso/SSOProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ArrowRight, Database, Server, RotateCcw } from 'lucide-react';

const TasksPage: React.FC = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = React.useState('tasks');

  const tasks = [
    {
      id: 'device-migration',
      title: 'Device Migration',
      description: "Move devices between OU's",
      icon: Server,
      path: '/tasks/device-migration',
      status: 'available'
    },
    {
      id: 'device-reset',
      title: 'Device Reset',
      description: 'Reset devices by wiping user data',
      icon: RotateCcw,
      path: '/tasks/device-reset',
      status: 'available'
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
                Tasks
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Perform batch operations and administrative tasks
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tasks.map((task) => {
                const Icon = task.icon;
                return (
                  <Link key={task.id} to={task.path}>
                    <Card className="hover:shadow-lg transition-shadow duration-200 cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                          </div>
                          <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                        </div>
                        <CardTitle className="mt-4">{task.title}</CardTitle>
                        <CardDescription>{task.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            Available
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
    </ThemeProvider>
  );
};

export default TasksPage;
