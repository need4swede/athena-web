import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import CurrentCheckoutsReport from '@/components/Reports/CurrentCheckoutsReport';
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

const CurrentCheckoutsReportPage: React.FC = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('reports');
  const [school, setSchool] = useState('all');
  const [checkoutBy, setCheckoutBy] = useState('');
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [includeSubdirectories, setIncludeSubdirectories] = useState(false);
  const [includePending, setIncludePending] = useState(true);

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
                  Current Checkouts Report
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Monitor active device assignments and pending signatures.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 mb-6 items-end">
                <div>
                  <Label htmlFor="school-filter" className="mb-2 block">Filter by school</Label>
                  <Select onValueChange={setSchool} defaultValue={school}>
                    <SelectTrigger id="school-filter" className="w-[260px]">
                      <SelectValue placeholder="Filter by school" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Schools</SelectItem>
                      {orgUnits.map((ou) => (
                        <SelectItem key={ou.orgUnitPath} value={ou.orgUnitPath}>
                          {ou.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="checkout-by-filter" className="mb-2 block">Filter by staff</Label>
                  <Input
                    id="checkout-by-filter"
                    placeholder="Filter by checkout staff..."
                    value={checkoutBy}
                    onChange={(event) => setCheckoutBy(event.target.value)}
                    className="w-[260px]"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-subdirectories"
                    checked={includeSubdirectories}
                    onCheckedChange={(checked) => setIncludeSubdirectories(Boolean(checked))}
                  />
                  <Label htmlFor="include-subdirectories">Include subdirectories</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-pending"
                    checked={includePending}
                    onCheckedChange={(checked) => setIncludePending(Boolean(checked))}
                  />
                  <Label htmlFor="include-pending">Include pending signatures</Label>
                </div>
              </div>

              <CurrentCheckoutsReport
                school={school}
                checkoutBy={checkoutBy}
                includeSubdirectories={includeSubdirectories}
                includePending={includePending}
              />
            </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default CurrentCheckoutsReportPage;
