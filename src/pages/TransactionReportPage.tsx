import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import TransactionReport from '@/components/Reports/TransactionReport';
import { ThemeProvider } from '@/components/ThemeProvider';
import { useAuth } from '@/components/sso/SSOProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/database';

interface OrgUnit {
  name: string;
  orgUnitPath: string;
}

const TransactionReportPage: React.FC = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('reports');
  const [school, setSchool] = useState('all');
  const [checkoutBy, setCheckoutBy] = useState('');
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [includeSubdirectories, setIncludeSubdirectories] = useState(false);

  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const schools = await apiRequest('/reports/schools') as OrgUnit[];
        setOrgUnits(schools);
      } catch (error) {
        console.error('Failed to fetch schools', error);
      }
    };

    fetchSchools();
  }, []);

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
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Transaction Report
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Filter and view transaction details.
                </p>
              </div>

              <div className="flex space-x-4 mb-6">
                <Select onValueChange={setSchool} defaultValue={school}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Filter by school" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Schools</SelectItem>
                    {orgUnits.map(ou => (
                      <SelectItem key={ou.orgUnitPath} value={ou.orgUnitPath}>
                        {ou.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Filter by checkout person..."
                  value={checkoutBy}
                  onChange={(e) => setCheckoutBy(e.target.value)}
                  className="w-[280px]"
                />
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-subdirectories"
                    checked={includeSubdirectories}
                    onCheckedChange={(checked) => setIncludeSubdirectories(checked as boolean)}
                  />
                  <Label htmlFor="include-subdirectories">Include subdirectories</Label>
                </div>
              </div>

              <TransactionReport school={school} checkoutBy={checkoutBy} includeSubdirectories={includeSubdirectories} />
            </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default TransactionReportPage;
