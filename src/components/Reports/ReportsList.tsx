
import React, { useState, useEffect } from 'react';
import { CalendarIcon, Download, Eye, FileSpreadsheet, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from '@/lib/utils';

interface SavedReport {
  id: string;
  name: string;
  type: string;
  date: Date;
  format: string;
  size: string;
}

interface ScheduledReport {
  id: string;
  name: string;
  type: string;
  frequency: string;
  nextRun: Date;
  recipients: string;
}

export const ReportsList: React.FC = () => {
  const [date, setDate] = useState<Date>();
  const [searchQuery, setSearchQuery] = useState('');
  const [reportType, setReportType] = useState('all');
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch saved reports from the API
  useEffect(() => {
    const fetchSavedReports = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/reports/saved');

        if (!response.ok) {
          // If API returns an error, just set an empty array
          setSavedReports([]);
          setLoading(false);
          return;
        }

        // Safely parse the JSON response
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          // If JSON parsing fails, just set an empty array
          setSavedReports([]);
          setLoading(false);
          return;
        }

        // If data is not an array or is empty, set an empty array
        if (!Array.isArray(data) || data.length === 0) {
          setSavedReports([]);
          setLoading(false);
          return;
        }

        // Transform the data to match our frontend SavedReport type
        const transformedData: SavedReport[] = data.map((item: any) => ({
          id: item.id?.toString() || Math.random().toString(36).substring(2, 9),
          name: item.name || 'Unnamed Report',
          type: item.type || 'inventory',
          date: item.date ? new Date(item.date) : new Date(),
          format: item.format || 'pdf',
          size: item.size || '0 KB'
        }));

        setSavedReports(transformedData);
      } catch (err) {
        // On any error, just set an empty array
        setSavedReports([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSavedReports();
  }, []);

  // Fetch scheduled reports from the API
  useEffect(() => {
    const fetchScheduledReports = async () => {
      try {
        const response = await fetch('/api/reports/scheduled');

        if (!response.ok) {
          // If API returns an error, just set an empty array
          setScheduledReports([]);
          return;
        }

        // Safely parse the JSON response
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          // If JSON parsing fails, just set an empty array
          setScheduledReports([]);
          return;
        }

        // If data is not an array or is empty, set an empty array
        if (!Array.isArray(data) || data.length === 0) {
          setScheduledReports([]);
          return;
        }

        // Transform the data to match our frontend ScheduledReport type
        const transformedData: ScheduledReport[] = data.map((item: any) => ({
          id: item.id?.toString() || Math.random().toString(36).substring(2, 9),
          name: item.name || 'Unnamed Scheduled Report',
          type: item.type || 'inventory',
          frequency: item.frequency || 'Monthly',
          nextRun: item.next_run ? new Date(item.next_run) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
          recipients: item.recipients || 'admin@example.com'
        }));

        setScheduledReports(transformedData);
      } catch (err) {
        // On any error, just set an empty array
        setScheduledReports([]);
      }
    };

    fetchScheduledReports();
  }, []);

  // Filter reports based on search query, date, and report type
  const filteredSavedReports = savedReports.filter(report => {
    const matchesSearch = searchQuery === '' ||
      report.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDate = !date ||
      (report.date.getFullYear() === date.getFullYear() &&
       report.date.getMonth() === date.getMonth() &&
       report.date.getDate() === date.getDate());

    const matchesType = reportType === 'all' || report.type === reportType;

    return matchesSearch && matchesDate && matchesType;
  });

  const filteredScheduledReports = scheduledReports.filter(report => {
    const matchesSearch = searchQuery === '' ||
      report.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = reportType === 'all' || report.type === reportType;

    return matchesSearch && matchesType;
  });

  const getReportTypeIcon = (type: string) => {
    switch (type) {
      case 'inventory':
        return <FileSpreadsheet className="w-4 h-4 text-blue-500" />;
      case 'checkouts':
        return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
      case 'usage':
        return <FileSpreadsheet className="w-4 h-4 text-purple-500" />;
      case 'maintenance':
        return <FileSpreadsheet className="w-4 h-4 text-yellow-500" />;
      default:
        return <FileSpreadsheet className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <CardTitle>Saved Reports</CardTitle>
        <div className="flex items-center space-x-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className="flex items-center justify-center gap-2 h-9"
              >
                <CalendarIcon className="w-4 h-4" />
                {date ? format(date, "MMM d, yyyy") : <span>Filter Date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Input
              placeholder="Search reports..."
              className="flex-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Select
              defaultValue="all"
              onValueChange={(value) => setReportType(value)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Report type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="checkouts">Checkouts</SelectItem>
                <SelectItem value="usage">Usage</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="saved" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="saved">Saved Reports</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled Reports</TabsTrigger>
            </TabsList>
            <TabsContent value="saved" className="mt-4 space-y-4">
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">Loading reports...</span>
                </div>
              ) : error ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-800 dark:text-red-200">Error loading reports: {error}</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 dark:bg-slate-800">
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Name</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Format</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Size</th>
                          <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSavedReports.length > 0 ? (
                          filteredSavedReports.map((report) => (
                            <tr key={report.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="p-4 align-middle">
                                <div className="flex items-center gap-2">
                                  {getReportTypeIcon(report.type)}
                                  <span>{report.name}</span>
                                </div>
                              </td>
                              <td className="p-4 align-middle">
                                {format(report.date, "MMM d, yyyy")}
                              </td>
                              <td className="p-4 align-middle hidden md:table-cell">
                                <div className="uppercase font-mono text-xs">{report.format}</div>
                              </td>
                              <td className="p-4 align-middle hidden md:table-cell">{report.size}</td>
                              <td className="p-4 align-middle">
                                <div className="flex justify-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => window.open(`/api/reports/view/${report.id}`, '_blank')}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => window.open(`/api/reports/download/${report.id}`, '_blank')}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-gray-500">
                              No reports found matching your criteria
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="scheduled" className="mt-4 space-y-4">
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600 dark:text-gray-400">Loading scheduled reports...</span>
                </div>
              ) : (
                <div className="rounded-md border">
                  <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 dark:bg-slate-800">
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Name</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Frequency</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Next Run</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Recipients</th>
                          <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredScheduledReports.length > 0 ? (
                          filteredScheduledReports.map((report) => (
                            <tr key={report.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="p-4 align-middle">
                                <div className="flex items-center gap-2">
                                  {getReportTypeIcon(report.type)}
                                  <span>{report.name}</span>
                                </div>
                              </td>
                              <td className="p-4 align-middle">{report.frequency}</td>
                              <td className="p-4 align-middle">
                                {format(report.nextRun, "MMM d, yyyy")}
                              </td>
                              <td className="p-4 align-middle hidden md:table-cell">
                                <div className="text-xs truncate max-w-[200px]">{report.recipients}</div>
                              </td>
                              <td className="p-4 align-middle">
                                <div className="flex justify-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => window.open(`/api/reports/scheduled/${report.id}`, '_blank')}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-gray-500">
                              No scheduled reports found matching your criteria
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
};
