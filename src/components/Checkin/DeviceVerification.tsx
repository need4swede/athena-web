import React from 'react';
import { User, Laptop, Calendar, ArrowRight, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Chromebook } from '@/types/chromebook';
import { StudentFee } from '@/types/fees';
import { getInsuranceStatusDisplay, getInsuranceStatusClasses } from '@/lib/insurance-utils';

interface DeviceVerificationProps {
  chromebook: Chromebook;
  onNext: () => void;
  insuranceFee?: StudentFee;
}

export const DeviceVerification: React.FC<DeviceVerificationProps> = ({ chromebook, onNext, insuranceFee }) => {
  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'Unknown';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, 'PPP');
  };

  const calculateDaysCheckedOut = () => {
    if (!chromebook.checkedOutDate) return 0;
    const checkoutDate = typeof chromebook.checkedOutDate === 'string'
      ? new Date(chromebook.checkedOutDate)
      : chromebook.checkedOutDate;
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - checkoutDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysOut = calculateDaysCheckedOut();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Device Verification
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Please verify the device and current assignment details before proceeding
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device Information Card */}
        <Card className="border-2 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <Laptop className="mr-2 h-5 w-5 text-blue-500" />
              Device Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Asset Tag:</span>
              <span className="text-sm font-semibold">{chromebook.assetTag}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Serial Number:</span>
              <span className="text-sm font-mono">{chromebook.serialNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Model:</span>
              <span className="text-sm">{chromebook.model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Current Status:</span>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                Checked Out
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Current Assignment Card */}
        <Card className="border-2 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <User className="mr-2 h-5 w-5 text-green-500" />
              Current Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Student:</span>
              <span className="text-sm font-semibold">
                {chromebook.currentUser?.firstName} {chromebook.currentUser?.lastName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Student ID:</span>
              <span className="text-sm font-mono">{chromebook.currentUser?.studentId}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Checked Out:</span>
              <span className="text-sm">{formatDate(chromebook.checkedOutDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Days Out:</span>
              <span className="text-sm font-semibold">
                {daysOut} {daysOut === 1 ? 'day' : 'days'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insurance Status */}
      <Card className="bg-gray-50 dark:bg-gray-800 border-0">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckCircle className="mr-2 h-5 w-5 text-blue-500" />
              <span className="font-medium">Insurance Status:</span>
            </div>
            <Badge
              variant="secondary"
              className={getInsuranceStatusClasses(chromebook)}
            >
              {getInsuranceStatusDisplay(chromebook)}
            </Badge>
          </div>
          {insuranceFee && insuranceFee.balance > 0 && (
            <div className="flex items-center justify-between pl-7">
              <div className="flex items-center">
                <span className="font-medium text-sm text-gray-600 dark:text-gray-400">Insurance Fee:</span>
              </div>
              <Badge
                variant="destructive"
              >
                ${insuranceFee.balance.toFixed(2)} Balance Due
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification Confirmation */}
      <Card className="border-2 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Ready to Process Return
              </h4>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Please confirm that this is the correct device being returned by{' '}
                <span className="font-semibold">
                  {chromebook.currentUser?.firstName} {chromebook.currentUser?.lastName}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Button */}
      <div className="flex justify-end">
        <Button onClick={onNext} size="lg" className="flex items-center">
          Proceed to Condition Assessment
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
