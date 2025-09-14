import React from 'react';
import { AlertTriangle, ArrowLeft, ExternalLink, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Chromebook } from '@/types/chromebook';

interface DeviceInServiceProps {
  chromebook: Chromebook;
  maintenanceId?: string | number;
  onPrevious: () => void;
}

export const DeviceInService: React.FC<DeviceInServiceProps> = ({
  chromebook,
  maintenanceId,
  onPrevious,
}) => {
  const studentName = chromebook.currentUser
    ? `${chromebook.currentUser.firstName} ${chromebook.currentUser.lastName}`
    : 'Unknown Student';

  const handleViewMaintenance = () => {
    if (maintenanceId) {
      window.location.href = `/maintenance?deviceId=${maintenanceId}`;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
          <Wrench className="h-5 w-5" />
          Device Currently in Service
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">
                Service in Progress
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300 mb-3">
                This device is currently being serviced and cannot be checked in again until the existing service request is completed.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Device Information</h4>
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">Asset Tag:</span> {chromebook.assetTag}</div>
              <div><span className="font-medium">Model:</span> {chromebook.model}</div>
              <div><span className="font-medium">Serial:</span> {chromebook.serialNumber}</div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Assignment</h4>
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">Student:</span> {studentName}</div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Status:</span>
                <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                  In Service
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">What happens next?</h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• The device remains assigned to {studentName}</li>
            <li>• IT Department will mark service as complete when repairs are finished</li>
            <li>• The device status will automatically return to its previous state</li>
            <li>• No new agreement needs to be signed and device can be handed back to {studentName}</li>
          </ul>
        </div>

        <div className="flex justify-between pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onPrevious}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {maintenanceId && (
            <Button
              onClick={handleViewMaintenance}
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              View Service Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
