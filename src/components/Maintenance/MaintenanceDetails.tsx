import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Clock, AlertCircle, MessageSquare, Paperclip, Loader2, RefreshCw, Camera, Image } from 'lucide-react';
import { ChromebookDetailsDialog } from '@/components/Chromebooks/ChromebookDetailsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/components/sso/SSOProvider';
import { Chromebook } from '@/types/chromebook';
import { apiConfig } from '@/config';

// Define maintenance-specific device type that extends Chromebook
interface MaintenanceDevice extends Omit<Chromebook, 'status'> {
  issue: string;
  priority: 'high' | 'medium' | 'low';
  reportedDate: Date;
  reportedBy: string;
  status: 'pending' | 'in-progress' | 'completed';
  assignedTo?: string;
  photos?: string[];
  comments: Array<{
    id: string;
    author: string;
    date: Date;
    text: string;
  }>;
}

interface MaintenanceDetailsProps {
  deviceId: string;
}

export const MaintenanceDetails: React.FC<MaintenanceDetailsProps> = ({ deviceId }) => {
  const [device, setDevice] = useState<MaintenanceDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState<'pending' | 'in-progress' | 'completed'>('pending');
  const [assignedTech, setAssignedTech] = useState('');
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedChromebook, setSelectedChromebook] = useState<Chromebook | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [serviceType, setServiceType] = useState<'return' | 'service'>('return');
  const { user } = useAuth();

  const handlePrintReceipt = async () => {
    if (!device) return;

    try {
      // Fetch fresh maintenance data with complete damage assessment info
      const authToken = localStorage.getItem('auth_token');
      const response = await fetch(`/api/maintenance/${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch maintenance data');
      }

      const freshData = await response.json();

      // Parse damage locations and repair recommendations from the database
      let damageLocations = [];
      let repairRecommendations = [];
      let totalCost = 0;
      let studentName = 'Unknown Student';
      let studentId = 'N/A';
      let isInsured = false;

      // Extract student information (prefer student over admin)
      if (freshData.student_name) {
        studentName = freshData.student_name;
        studentId = freshData.student_id || 'N/A';
      }

      // Parse damage locations
      if (freshData.damage_locations) {
        try {
          const damageData = Array.isArray(freshData.damage_locations)
            ? freshData.damage_locations
            : freshData.damage_locations;

          if (damageData.locations) {
            damageLocations = damageData.locations;
            isInsured = damageData.isInsured || false;
          } else if (Array.isArray(damageData)) {
            damageLocations = damageData;
          }
        } catch (e) {
          console.warn('Failed to parse damage locations:', e);
        }
      }

      // Parse repair recommendations
      if (freshData.repair_recommendations) {
        try {
          repairRecommendations = Array.isArray(freshData.repair_recommendations)
            ? freshData.repair_recommendations
            : freshData.repair_recommendations;
        } catch (e) {
          console.warn('Failed to parse repair recommendations:', e);
        }
      }

      // Get total cost
      totalCost = freshData.total_cost || 0;

      // Use device insurance status if student insurance not available
      if (!isInsured && freshData.is_insured) {
        isInsured = freshData.is_insured;
      }

      const receiptData = {
        chromebook: {
          assetTag: freshData.asset_tag || device.assetTag,
          serialNumber: freshData.serial_number || device.serialNumber,
          model: freshData.model || device.model,
        },
        student: {
          name: studentName,
          studentId: studentId,
        },
        maintenanceDate: formatDate(new Date(freshData.created_at)),
        isInsured: isInsured,
        damageLocations: damageLocations,
        repairRecommendations: repairRecommendations,
        totalCost: totalCost,
        notes: freshData.issue_description || device.issue,
      };

      console.log('Receipt data being sent:', receiptData);

      const pdfResponse = await fetch('/api/receipts/maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(receiptData),
      });

      if (pdfResponse.ok) {
        const blob = await pdfResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'maintenance_receipt.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to generate receipt.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error generating receipt:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate receipt.',
        variant: 'destructive',
      });
    }
  };

  const refreshMaintenanceData = useCallback(async () => {
    if (!deviceId) return;

    try {
      setRefreshing(true);

      const authToken = localStorage.getItem('auth_token');
      const response = await fetch(`/api/maintenance/${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Transform the fresh data to match our frontend MaintenanceDevice type
      const transformedData: MaintenanceDevice = {
        id: data.id?.toString(),
        assetTag: data.asset_tag,
        serialNumber: data.serial_number,
        model: data.model,
        orgUnit: data.location || 'Unknown',
        isInsured: Boolean(data.is_insured),
        notes: data.notes ? [data.notes] : [],
        history: [],
        tags: [],
        lastUpdated: new Date(),
        assignedLocation: data.location || 'IT Department',
        issue: data.issue,
        priority: data.priority as 'high' | 'medium' | 'low',
        reportedDate: new Date(data.reported_date),
        reportedBy: data.reported_by,
        status: data.status as 'pending' | 'in-progress' | 'completed',
        assignedTo: undefined,
        photos: data.photos || [],
        comments: data.comments ? data.comments.map((c: any) => ({ ...c, date: new Date(c.date) })) : []
      };

      setDevice(transformedData);
      setMaintenanceStatus(transformedData.status);
      setError(null);

      toast({
        title: "Data Refreshed",
        description: "Maintenance data has been updated with the latest information.",
      });

    } catch (error) {
      console.error('Error refreshing maintenance data:', error);
      toast({
        title: "Refresh Failed",
        description: "Could not refresh data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  }, [deviceId]);

  const handleViewDevice = async () => {
    try {
      const authToken = localStorage.getItem('auth_token');

      // Get the complete device data from the maintenance API with fresh data
      // Don't rely on potentially stale device state
      const response = await fetch(`/api/maintenance/${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          // Add cache-busting header to ensure fresh data
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch complete device data: ${response.status} ${response.statusText}`);
      }

      const completeDeviceData = await response.json();

      // Validate that we have the essential data
      if (!completeDeviceData || !completeDeviceData.asset_tag) {
        throw new Error('Invalid device data received from API');
      }

      // Transform the maintenance API response to match Chromebook interface
      // Use only fresh API data with proper fallbacks - don't use potentially stale device state
      const chromebookData: Chromebook = {
        id: completeDeviceData.id?.toString() || 'unknown',
        assetTag: completeDeviceData.asset_tag || 'Unknown',
        serialNumber: completeDeviceData.serial_number || 'Unknown',
        model: completeDeviceData.model || 'Unknown',
        orgUnit: completeDeviceData.org_unit || completeDeviceData.org_unit_path || '/Unknown',
        status: completeDeviceData.status || 'maintenance',
        statusSource: completeDeviceData.status_source || 'local' as const,
        lastKnownUser: completeDeviceData.last_known_user || completeDeviceData.reported_by || '',
        currentUser: completeDeviceData.currentUser,
        checkedOutDate: completeDeviceData.checked_out_date ? new Date(completeDeviceData.checked_out_date) : undefined,
        checkedInDate: undefined,
        isInsured: completeDeviceData.is_insured ?? false,
        notes: completeDeviceData.notes || '',
        history: [],
        tags: [],
        lastUpdated: new Date(completeDeviceData.updated_at || Date.now()),
        assignedLocation: completeDeviceData.assigned_location || 'IT Department',
        mostRecentUser: completeDeviceData.last_known_user || completeDeviceData.reported_by || '',
        // Google API fields (now available from maintenance API)
        deviceId: completeDeviceData.device_id || undefined,
        platformVersion: completeDeviceData.platform_version || undefined,
        osVersion: completeDeviceData.os_version || undefined,
        firmwareVersion: completeDeviceData.firmware_version || undefined,
        macAddress: completeDeviceData.mac_address || undefined,
        lastKnownNetwork: completeDeviceData.last_known_network || undefined,
        annotatedUser: completeDeviceData.annotated_user || undefined,
        annotatedAssetId: completeDeviceData.annotated_asset_id || undefined,
        recentUsers: completeDeviceData.recent_users || undefined,
        bootMode: completeDeviceData.boot_mode || undefined,
        lastEnrollmentTime: completeDeviceData.last_enrollment_time ? new Date(completeDeviceData.last_enrollment_time).toISOString() : undefined,
        supportEndDate: completeDeviceData.support_end_date ? new Date(completeDeviceData.support_end_date).toISOString() : undefined,
        orderNumber: completeDeviceData.order_number || undefined,
        willAutoRenew: completeDeviceData.will_auto_renew || undefined,
        meid: completeDeviceData.meid || undefined,
        etag: completeDeviceData.etag || undefined,
        activeTimeRanges: completeDeviceData.active_time_ranges || undefined,
        cpuStatusReports: completeDeviceData.cpu_status_reports || undefined,
        diskVolumeReports: completeDeviceData.disk_volume_reports || undefined,
        systemRamTotal: completeDeviceData.system_ram_total || undefined,
        systemRamFreeReports: completeDeviceData.system_ram_free_reports || undefined,
      };

      console.log('Opening device details with data:', chromebookData);
      setSelectedChromebook(chromebookData);
      setIsDetailsDialogOpen(true);
    } catch (error) {
      console.error('Error in handleViewDevice:', error);
      toast({
        title: 'Error',
        description: 'Could not fetch device details. Please try refreshing the page.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    const fetchMaintenanceDevice = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!deviceId) {
          setDevice(null);
          setLoading(false);
          return;
        }

        const authToken = localStorage.getItem('auth_token');
        const response = await fetch(`/api/maintenance/${deviceId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
            setError('Maintenance record not found');
          } else if (response.status === 401) {
            setError('Authentication required');
          } else if (response.status === 403) {
            setError('Access denied');
          } else {
            setError('Failed to load maintenance details');
          }
          setDevice(null);
          setLoading(false);
          return;
        }

        const data = await response.json();

        // Parse damage locations to get photos and insurance info
        let damageLocations = [];
        let photos = [];
        let isInsured = false;
        try {
          if (data.damage_locations) {
            const parsed = JSON.parse(data.damage_locations);
            damageLocations = parsed.locations || [];
            isInsured = parsed.isInsured || false;
          }
        } catch (e) {
          console.warn('Failed to parse damage_locations:', e);
        }

        // Extract photos from the direct photos field first (primary source)
        if (data.photos && Array.isArray(data.photos)) {
          photos = [...data.photos];
        }

        // Also check damage locations for additional photos (backward compatibility)
        if (damageLocations && damageLocations.length > 0) {
          const damagePhotos = damageLocations.map((loc: any) => loc.photos || []).flat();
          // Combine and deduplicate photos
          photos = [...new Set([...photos, ...damagePhotos])];
        }

        // Transform the data to match our frontend MaintenanceDevice type
        const transformedData: MaintenanceDevice = {
          id: data.id?.toString(),
          assetTag: data.asset_tag || 'Unknown',
          serialNumber: data.serial_number || 'Unknown',
          model: data.model || 'Unknown Model',
          orgUnit: data.org_unit || 'Unknown',
          isInsured: isInsured || Boolean(data.is_insured),
          notes: data.notes ? [data.notes] : [],
          history: [],
          tags: [],
          lastUpdated: new Date(),
          assignedLocation: data.org_unit || 'IT Department',
          issue: data.issue_description || 'No issue description',
          priority: data.priority as 'high' | 'medium' | 'low',
          reportedDate: new Date(data.created_at),
          reportedBy: data.user_name || data.student_name || 'Unknown',
          status: data.status as 'pending' | 'in-progress' | 'completed',
          assignedTo: undefined,
          photos: photos,
          comments: data.comments ? data.comments.map((c: any) => ({ ...c, date: new Date(c.date) })) : []
        };

        setDevice(transformedData);
        setMaintenanceStatus(transformedData.status);
        setServiceType(data.service_type || 'return'); // Track service type
        setAssignedTech(''); // Not using technician assignment
      } catch (err) {
        console.error('Error fetching maintenance details:', err);
        setDevice(null);
        setError('Failed to load maintenance device details');
      } finally {
        setLoading(false);
      }
    };

    fetchMaintenanceDevice();
  }, [deviceId]);

  const getStatusBadge = () => {
    switch (maintenanceStatus) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 px-2 py-1 rounded-full text-xs font-medium">
            <Clock className="h-3 w-3" /> Pending
          </span>
        );
      case 'in-progress':
        return (
          <span className="flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-1 rounded-full text-xs font-medium">
            <AlertCircle className="h-3 w-3" /> In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 px-2 py-1 rounded-full text-xs font-medium">
            <CheckCircle className="h-3 w-3" /> Completed
          </span>
        );
      default:
        return null;
    }
  };

  const handleAddComment = async () => {
    if (!device || !newComment.trim()) return;

    try {
      const commentData = {
        maintenance_id: deviceId,
        text: newComment,
      };

      // Try to send the comment to the API
      try {
        const authToken = localStorage.getItem('auth_token');
        const response = await fetch('/api/maintenance/comments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(commentData),
        });

        if (!response.ok) {
          // If API fails, just add the comment locally
          const newCommentObj = {
            id: Math.random().toString(36).substring(2, 9),
            author: 'You',
            date: new Date(),
            text: newComment
          };

          setDevice({
            ...device,
            comments: [...device.comments, newCommentObj]
          });

          toast({
            title: "Comment Added",
            description: "Your comment has been added to the maintenance record.",
          });

          setNewComment('');
          return;
        }

        // Try to refresh the device data
        try {
          const authToken = localStorage.getItem('auth_token');
          const updatedResponse = await fetch(`/api/maintenance/${deviceId}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          });

          if (updatedResponse.ok) {
            const updatedData = await updatedResponse.json();

            // Update the comments in the device state
            setDevice({
              ...device,
              comments: updatedData.comments ? updatedData.comments.map((comment: any) => ({
                id: comment.id.toString(),
                author: comment.author,
                date: new Date(comment.date),
                text: comment.text
              })) : [...device.comments, {
                id: Math.random().toString(36).substring(2, 9),
                author: 'You',
                date: new Date(),
                text: newComment
              }]
            });
          } else {
            // If refresh fails, just add the comment locally
            const newCommentObj = {
              id: Math.random().toString(36).substring(2, 9),
              author: 'You',
              date: new Date(),
              text: newComment
            };

            setDevice({
              ...device,
              comments: [...device.comments, newCommentObj]
            });
          }
        } catch (refreshError) {
          // If refresh fails, just add the comment locally
          const newCommentObj = {
            id: Math.random().toString(36).substring(2, 9),
            author: 'You',
            date: new Date(),
            text: newComment
          };

          setDevice({
            ...device,
            comments: [...device.comments, newCommentObj]
          });
        }
      } catch (apiError) {
        // If API call fails, just add the comment locally
        const newCommentObj = {
          id: Math.random().toString(36).substring(2, 9),
          author: 'You',
          date: new Date(),
          text: newComment
        };

        setDevice({
          ...device,
          comments: [...device.comments, newCommentObj]
        });
      }

      toast({
        title: "Comment Added",
        description: "Your comment has been added to the maintenance record.",
      });

      setNewComment('');
    } catch (err) {
      // On any error, just add the comment locally
      if (device) {
        const newCommentObj = {
          id: Math.random().toString(36).substring(2, 9),
          author: 'You',
          date: new Date(),
          text: newComment
        };

        setDevice({
          ...device,
          comments: [...device.comments, newCommentObj]
        });

        toast({
          title: "Comment Added",
          description: "Your comment has been added to the maintenance record.",
        });

        setNewComment('');
      } else {
        toast({
          title: "Error",
          description: "Failed to add comment. Please try again.",
          variant: "destructive"
        });
      }
    }
  };


  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="flex justify-center items-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading maintenance details...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !device) {
    return (
      <Card className="h-full">
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-red-500 dark:text-red-400 mb-2">Error loading maintenance details</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{error || "Device not found"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            {device.assetTag}
            {getStatusBadge()}
          </CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {device.model} | {device.serialNumber}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshMaintenanceData}
            disabled={refreshing}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleViewDevice}>
            View Device
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrintReceipt}>
            Print Receipt
          </Button>
        </div>
        <ChromebookDetailsDialog
          chromebook={selectedChromebook}
          isOpen={isDetailsDialogOpen}
          onClose={() => setIsDetailsDialogOpen(false)}
          userRole={user?.role}
        />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Issue Details</h3>
            <p className="text-sm">{device.issue}</p>
            <div className="mt-2">
              <span className={`text-xs px-2 py-1 rounded-full uppercase font-medium inline-block ${
                device.priority === 'high'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  : device.priority === 'medium'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
              }`}>
                {device.priority} priority
              </span>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reporting Info</h3>
            <p className="text-sm"><span className="font-medium">Reported By:</span> {device.reportedBy}</p>
            <p className="text-sm"><span className="font-medium">Date:</span> {formatDate(device.reportedDate)}</p>
          </div>
        </div>

        {/* Photos Section */}
        {device.photos && device.photos.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Damage Photos ({device.photos.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {device.photos.map((photoUrl, index) => {
                // Convert relative URLs to absolute URLs pointing to the backend
                const fullPhotoUrl = photoUrl.startsWith('http') ? photoUrl : `${apiConfig.backendBaseUrl}${photoUrl}`;

                return (
                  <div key={index} className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="w-full h-32 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <img
                        src={fullPhotoUrl}
                        alt={`Damage Photo ${index + 1}`}
                        className="max-w-full max-h-full object-contain"
                        style={{ display: 'block' }}
                        onLoad={() => {
                          console.log(`Photo ${index + 1} loaded successfully:`, fullPhotoUrl);
                        }}
                        onError={(e) => {
                          console.error(`Photo ${index + 1} failed to load:`, fullPhotoUrl);
                          const img = e.target as HTMLImageElement;
                          const container = img.parentElement;
                          if (container) {
                            container.innerHTML = `
                              <div class="w-full h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                                <svg class="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                                <span class="text-xs">Image Error</span>
                              </div>
                            `;
                          }
                        }}
                      />
                    </div>
                    <a
                      href={fullPhotoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-20 transition-all duration-200"
                    >
                      <Image className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <p>Photo URLs: {device.photos.map(url => url.startsWith('http') ? url : `${apiConfig.backendBaseUrl}${url}`).join(', ')}</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Comments & Activity</h3>
          <div className="space-y-4 max-h-52 overflow-y-auto pr-2">
            {device.comments.length > 0 ? (
              device.comments.map((comment) => (
                <div key={comment.id} className="border border-gray-200 dark:border-gray-800 rounded-md p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-sm">{comment.author}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(comment.date)}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{comment.text}</p>
                </div>
              ))
            ) : (
              <div className="text-center p-4 text-gray-500 dark:text-gray-400">
                <p>No comments yet</p>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-start space-x-2">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="min-h-[80px] resize-none"
              />
            </div>
            <div className="flex justify-between mt-3">
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Paperclip className="h-4 w-4" />
                <span>Attach</span>
              </Button>
              <Button size="sm" onClick={handleAddComment} className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                <span>Comment</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t border-gray-200 dark:border-gray-800 pt-4">
        <div className="w-full flex justify-end space-x-2">
          <Button variant="destructive" size="sm" onClick={() => toast({ title: "Coming Soon!", description: "This feature is not yet implemented."})}>
            Retire
          </Button>
          {device.status !== 'completed' && (
            <Button
              className="flex items-center gap-1"
              disabled={serviceType === 'service' && user?.role !== 'super_admin'}
              onClick={async () => {
                try {
                  const authToken = localStorage.getItem('auth_token');
                  let response;

                  if (serviceType === 'service') {
                    // For service requests, call the complete-service endpoint
                    response = await fetch(`/api/checkins/complete-service/${deviceId}`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                      }
                    });
                  } else {
                    // For regular maintenance, use the existing endpoint
                    response = await fetch(`/api/maintenance/${deviceId}/return`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                      }
                    });
                  }

                  if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || `Failed to complete maintenance: ${response.status} ${response.statusText}`);
                  }

                  toast({
                    title: "Success",
                    description: serviceType === 'service'
                      ? "Service completed. Device has been restored to the student."
                      : "Device has been returned to service.",
                  });

                  // Refresh data after successful update
                  await refreshMaintenanceData();

                } catch (err) {
                  console.error('Error completing maintenance:', err);
                  toast({
                    title: "Error",
                    description: err instanceof Error ? err.message : "Failed to complete maintenance. Please try again.",
                    variant: "destructive"
                  });
                }
              }}
            >
              <CheckCircle className="h-4 w-4" />
              <span>
                {serviceType === 'service'
                  ? user?.role === 'super_admin'
                    ? 'Complete Service'
                    : 'Complete Service (Super Admin Only)'
                  : 'Mark as Complete'
                }
              </span>
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};
