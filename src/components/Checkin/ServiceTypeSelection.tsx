import React from 'react';
import { ArrowLeft, Package, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Chromebook } from '@/types/chromebook';

interface ServiceTypeSelectionProps {
  chromebook: Chromebook;
  onSelect: (serviceType: 'return' | 'service') => void;
  onPrevious: () => void;
}

export const ServiceTypeSelection: React.FC<ServiceTypeSelectionProps> = ({
  chromebook,
  onSelect,
  onPrevious,
}) => {
  const studentName = chromebook.currentUser ?
    `${chromebook.currentUser.firstName} ${chromebook.currentUser.lastName}` :
    'Unknown Student';

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Check-in Type Selection
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          How is this device being processed today?
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Device Information</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Asset Tag:</span>
              <span className="font-medium">{chromebook.assetTag}</span>
            </div>
            <div className="flex justify-between">
              <span>Model:</span>
              <span className="font-medium">{chromebook.model}</span>
            </div>
            <div className="flex justify-between">
              <span>Current User:</span>
              <span className="font-medium">{studentName}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <Badge variant={chromebook.status === 'checked-out' ? 'default' : 'secondary'}>
                {chromebook.status}
              </Badge>
            </div>
            {chromebook.inService && (
              <div className="flex justify-between">
                <span>Service Status:</span>
                <Badge variant="outline" className="text-orange-600 border-orange-600">
                  Currently in Service
                </Badge>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            size="lg"
            variant="outline"
            className="h-32 flex flex-col gap-3 border-2 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => onSelect('return')}
          >
            <Package className="h-8 w-8 text-red-500" />
            <div className="text-center">
              <div className="font-semibold text-base">Return Device</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Permanent check-in
              </div>
            </div>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-32 flex flex-col gap-3 border-2 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            onClick={() => onSelect('service')}
          >
            <Wrench className="h-8 w-8 text-blue-500" />
            <div className="text-center">
              <div className="font-semibold text-base">Service Request</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Temporary maintenance
              </div>
            </div>
          </Button>
        </div>

        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Return Device</h4>
            <p>
              Choose this option when the student is permanently returning the device.
              This will complete the check-in process and make the device available for assignment to another student.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Service Request</h4>
            <p>
              Choose this option when the device needs temporary maintenance or repair work.
              The device will remain assigned to {studentName} and can be returned to them once service is complete.
            </p>
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onPrevious}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
