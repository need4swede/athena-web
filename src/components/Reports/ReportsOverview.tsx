
import React from 'react';
import { BarChart, FileText, Download, PieChart, List, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TransactionReport from './TransactionReport';
import { useState } from 'react';

export const ReportsOverview: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  const reportTypes = [
    {
      id: 'transactions',
      title: 'Transaction Report',
      description: 'Report of all payments and fees',
      icon: DollarSign,
      primary: true,
    },
    {
      id: 'inventory',
      title: 'Inventory Status',
      description: 'Overview of all devices by status',
      icon: PieChart,
      primary: false,
    },
    {
      id: 'checkouts',
      title: 'Current Checkouts',
      description: 'List of all checked out devices',
      icon: List,
      primary: false,
    },
    {
      id: 'usage',
      title: 'Usage Statistics',
      description: 'Device utilization and checkout frequency',
      icon: BarChart,
      primary: false,
    },
    {
      id: 'maintenance',
      title: 'Maintenance Report',
      description: 'Devices requiring maintenance or repair',
      icon: FileText,
      primary: false,
    }
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Generate Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Select a report type to generate or view saved reports
          </p>
          <div className="space-y-3">
            {reportTypes.map((report) => (
              <Button
                key={report.id}
                variant={report.primary ? 'default' : 'outline'}
                className={`w-full justify-start h-auto py-3 ${
                  report.primary ? '' : 'border-gray-200 dark:border-gray-800'
                }`}
                onClick={() => setSelectedReport(report.id)}
              >
                <div className="flex items-start">
                  <div
                    className={`rounded-lg p-2 mr-3 ${
                      report.primary ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                  >
                    <report.icon
                      className={`w-4 h-4 ${
                        report.primary ? 'text-white' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    />
                  </div>
                  <div className="text-left">
                    <div
                      className={`font-medium ${
                        report.primary ? 'text-white' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {report.title}
                    </div>
                    <div
                      className={`text-xs mt-1 ${
                        report.primary ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {report.description}
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="link" className="w-full flex items-center justify-center">
            <Download className="w-4 h-4 mr-2" />
            <span>Download All Reports</span>
          </Button>
        </CardFooter>
      </Card>

      {/* Transaction Report Modal */}
      <Dialog open={selectedReport === 'transactions'} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Report</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <TransactionReport />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
