
import React, { useState, useEffect } from 'react';
import { Search, Filter, AlertTriangle, Plus, Loader2, Camera } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chromebook } from '@/types/chromebook';

// Create a specific type for maintenance devices
interface MaintenanceDevice extends Omit<Chromebook, 'status'> {
  issue?: string;
  priority: 'high' | 'medium' | 'low';
  reportedDate: Date;
  status: 'pending' | 'in-progress' | 'completed';
  maintenanceId: string;
  photos?: string[];
}

interface MaintenanceListProps {
  onSelectDevice: (id: string) => void;
  selectedDeviceId: string | null;
  refresh?: boolean;
  onRefreshComplete?: () => void;
}

export const MaintenanceList: React.FC<MaintenanceListProps> = ({ onSelectDevice, selectedDeviceId, refresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // New status filter
  const [priorityFilter, setPriorityFilter] = useState('all'); // Renamed for clarity
  const [devices, setDevices] = useState<MaintenanceDevice[]>([]);
  const [allDevices, setAllDevices] = useState<MaintenanceDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch maintenance devices from the API
  const fetchMaintenanceDevices = async () => {
    try {
      setLoading(true);
      setError(null);

      const authToken = localStorage.getItem('auth_token');
      const response = await fetch('/api/maintenance', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Authentication required');
        } else if (response.status === 403) {
          setError('Access denied');
        } else {
          setError('Failed to load maintenance devices');
        }
        setAllDevices([]);
        setDevices([]);
        return;
      }

      const data = await response.json();

      // Transform the data to match our frontend MaintenanceDevice type
      const transformedData: MaintenanceDevice[] = data.map((item: any) => {
        // Parse damage locations to check for insurance info
        let damageLocations = [];
        let isInsured = false;
        try {
          if (item.damage_locations) {
            const parsed = JSON.parse(item.damage_locations);
            damageLocations = parsed.locations || [];
            isInsured = parsed.isInsured || false;
          }
        } catch (e) {
          console.warn('Failed to parse damage_locations:', e);
        }

        return {
          id: item.id?.toString(),
          assetTag: item.asset_tag || 'Unknown',
          serialNumber: item.serial_number || 'Unknown',
          model: item.model || 'Unknown Model',
          orgUnit: item.org_unit || 'Unknown',
          isInsured: isInsured,
          notes: item.notes ? [item.notes] : [],
          history: [],
          tags: [],
          lastUpdated: new Date(),
          assignedLocation: item.org_unit || 'IT Department',
          issue: item.issue_description,
          priority: item.priority as 'high' | 'medium' | 'low',
          reportedDate: new Date(item.created_at),
          status: item.status as 'pending' | 'in-progress' | 'completed',
          maintenanceId: item.id?.toString(),
          photos: damageLocations.map((loc: any) => loc.photos || []).flat(),
        };
      });

      setAllDevices(transformedData);
      setDevices(transformedData);
    } catch (err) {
      console.error('Error fetching maintenance devices:', err);
      setError('Failed to load maintenance devices');
      setAllDevices([]);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaintenanceDevices();
  }, []);

  // Separate effect for refresh to ensure it triggers a new fetch
  useEffect(() => {
    if (refresh) {
      fetchMaintenanceDevices();
    }
  }, [refresh]);

  // Apply filters whenever filter states change
  useEffect(() => {
    if (allDevices.length > 0) {
      applyAllFilters();
    }
  }, [statusFilter, priorityFilter, searchQuery, allDevices]);

  const applyAllFilters = () => {
    let filtered = allDevices;

    // Apply status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(device =>
        device.status === 'pending' || device.status === 'in-progress'
      );
    } else if (statusFilter === 'completed') {
      filtered = filtered.filter(device => device.status === 'completed');
    }
    // 'all' status filter shows everything

    // Apply priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(device => device.priority === priorityFilter);
    }

    // Apply search query
    if (searchQuery.trim() !== '') {
      filtered = filtered.filter(device =>
        device.assetTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.issue?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setDevices(filtered);
  };

  const handleSearch = () => {
    applyAllFilters();
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
  };

  const handlePriorityFilter = (value: string) => {
    setPriorityFilter(value);
  };

  const getPriorityClass = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'low':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getIssueSummary = (issue: string | undefined) => {
    if (!issue) return "No issue description";

    if (issue.startsWith("Multiple damage locations identified:")) {
      const parts = issue.split(':');
      if (parts.length > 1) {
        return `Multiple damages: ${parts.slice(1).join(':').trim()}`;
      }
    }

    const maxLength = 50;
    if (issue.length > maxLength) {
      return `${issue.substring(0, maxLength)}...`;
    }

    return issue;
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Devices in Maintenance</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading maintenance devices...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Devices in Maintenance</CardTitle>
        </CardHeader>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-red-500 dark:text-red-400 mb-2">Error loading maintenance devices</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Devices in Maintenance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pr-8"
            />
            <Search
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
              size={18}
              onClick={handleSearch}
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All Status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={handlePriorityFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
          {devices.length > 0 ? (
            devices.map((device) => (
              <div
                key={device.maintenanceId}
                className={`border rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
                  selectedDeviceId === device.maintenanceId ? 'border-blue-500 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-800'
                }`}
                onClick={() => onSelectDevice(device.maintenanceId)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <div>
                      <h3 className="font-medium text-sm">{device.assetTag}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{device.model}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full uppercase font-medium ${getPriorityClass(device.priority)}`}>
                    {device.priority}
                  </span>
                </div>
                <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  {getIssueSummary(device.issue)}
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex justify-between items-center">
                  <span>Reported: {device.reportedDate.toLocaleDateString()}</span>
                  {device.photos && device.photos.length > 0 && (
                    <Camera className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center p-4 text-gray-500 dark:text-gray-400">
              <p>No devices found</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
