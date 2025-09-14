import React from 'react';
import { CheckCircle, Download, Home, RotateCcw, DollarSign, AlertTriangle, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Chromebook } from '@/types/chromebook';
import { DamageLocation, RepairRecommendation } from './CheckinWorkflow';

interface CheckinConfirmationProps {
  chromebook: Chromebook;
  damageLocations: DamageLocation[];
  repairRecommendations: RepairRecommendation[];
  totalCost: number;
  notes?: string;
  specialInstructions?: string;
  onComplete?: () => void;
}

export const CheckinConfirmation: React.FC<CheckinConfirmationProps> = ({
  chromebook,
  damageLocations,
  repairRecommendations,
  totalCost,
  notes,
  specialInstructions,
  onComplete,
}) => {
  const checkinDate = new Date();
  const hasRepairs = repairRecommendations.length > 0;
  const newStatus = damageLocations.length > 0 ? 'maintenance' : 'available';

  const generateReceiptData = () => {
    return {
      chromebook: {
        assetTag: chromebook.assetTag,
        serialNumber: chromebook.serialNumber,
        model: chromebook.model,
      },
      student: {
        name: `${chromebook.currentUser?.firstName} ${chromebook.currentUser?.lastName}`,
        studentId: chromebook.currentUser?.studentId,
      },
      checkinDate: format(checkinDate, 'PPP p'),
      damageLocations,
      repairRecommendations,
      totalCost,
      newStatus,
      notes,
      specialInstructions,
    };
  };

  const handlePrintReceipt = async () => {
    const receiptData = generateReceiptData();
    try {
      const response = await fetch('/api/receipts/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(receiptData),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF receipt');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checkin-receipt-${chromebook.assetTag}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('Error printing receipt:', error);
      // You might want to show a toast notification to the user here
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Checkin Complete!
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          The Chromebook has been successfully checked in and processed.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device Summary */}
        <Card className="border-2 border-green-200 dark:border-green-800">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
              Device Summary
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
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
              <Badge
                variant="secondary"
                className={cn(
                  newStatus === 'available'
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                )}
              >
                {newStatus === 'available' ? 'Returned' : 'Needs Repair'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Checkin Date:</span>
              <span className="text-sm">{format(checkinDate, 'PPP')}</span>
            </div>
          </CardContent>
        </Card>

        {/* Student Summary */}
        <Card className="border-2 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <Calendar className="mr-2 h-5 w-5 text-blue-500" />
              Return Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Returned By:</span>
              <span className="text-sm font-semibold">
                {chromebook.currentUser?.firstName} {chromebook.currentUser?.lastName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Student ID:</span>
              <span className="text-sm font-mono">{chromebook.currentUser?.studentId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Checkout Date:</span>
              <span className="text-sm">{format(chromebook.checkedOutDate || new Date(), 'PPP')}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Damage Issues:</span>
              <span className="text-sm font-semibold">
                {damageLocations.length} {damageLocations.length === 1 ? 'issue' : 'issues'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Repair Cost:</span>
              <span className={cn(
                "text-sm font-semibold",
                totalCost > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
              )}>
                ${totalCost}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Damage and Repair Details */}
      {(damageLocations.length > 0 || repairRecommendations.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Damage Details */}
          {damageLocations.length > 0 && (
            <Card className="border-2 border-orange-200 dark:border-orange-800">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <AlertTriangle className="mr-2 h-5 w-5 text-orange-500" />
                  Damage Report ({damageLocations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {damageLocations.map((damage) => (
                    <div key={damage.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-white text-xs",
                            damage.severity === 'minor' && "bg-yellow-500",
                            damage.severity === 'major' && "bg-orange-500",
                            damage.severity === 'critical' && "bg-red-500"
                          )}
                        >
                          {damage.severity}
                        </Badge>
                        <span className="text-sm font-medium">{damage.area}</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{damage.damageType}</p>
                      {damage.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {damage.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Repair Recommendations */}
          {repairRecommendations.length > 0 && (
            <Card className="border-2 border-purple-200 dark:border-purple-800">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <DollarSign className="mr-2 h-5 w-5 text-purple-500" />
                  Repair Plan (${totalCost})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {repairRecommendations.map((rec, index) => (
                    <div key={index} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <Badge
                            variant="secondary"
                            className={cn(
                              rec.priority === 'low' && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                              rec.priority === 'medium' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                              rec.priority === 'high' && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            )}
                          >
                            {rec.priority}
                          </Badge>
                          <span className="text-sm font-medium">{rec.item}</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{rec.description}</p>
                      </div>
                      <span className="text-sm font-semibold">${rec.cost}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Notes */}
      {(notes || specialInstructions) && (
        <Card className="border-2 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <FileText className="mr-2 h-5 w-5 text-gray-500" />
              Additional Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {notes && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes:</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  {notes}
                </p>
              </div>
            )}
            {specialInstructions && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Special Instructions:</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  {specialInstructions}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
        <Button
          variant="outline"
          onClick={handlePrintReceipt}
          className="flex items-center space-x-2"
        >
          <Download className="h-4 w-4" />
          <span>Print Receipt</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="flex items-center space-x-2"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Process Another Checkin</span>
        </Button>
        <Button
          onClick={() => window.location.href = '/'}
          className="flex items-center space-x-2"
        >
          <Home className="h-4 w-4" />
          <span>Return to Dashboard</span>
        </Button>
      </div>
    </div>
  );
};
