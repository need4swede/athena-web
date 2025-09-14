import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { ArrowRight, ArrowLeft, Loader2, DollarSign, AlertTriangle, FileText, Wrench, CheckCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Chromebook } from '@/types/chromebook';
import { DamageLocation, RepairRecommendation } from './CheckinWorkflow';

interface ProcessingDetailsProps {
  chromebook: Chromebook;
  damageLocations: DamageLocation[];
  repairRecommendations: RepairRecommendation[];
  totalCost: number;
  form: UseFormReturn<any>;
  isSubmitting: boolean;
  onSubmit: () => void;
  onPrevious: () => void;
}

export const ProcessingDetails: React.FC<ProcessingDetailsProps> = ({
  chromebook,
  damageLocations,
  repairRecommendations,
  totalCost,
  form,
  isSubmitting,
  onSubmit,
  onPrevious,
}) => {
  const condition = form.watch('condition');

  const getStatusFromCondition = () => {
    if (condition === 'good') {
      return 'available';
    }
    // Any other condition ('damaged', 'requires_repair') should go to maintenance
    return 'maintenance';
  };

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getActionItems = (): string[] => {
    const items: string[] = [];

    if (repairRecommendations.length > 0) {
      repairRecommendations.forEach(rec => {
        if (rec.cost > 0) {
          items.push(`Order ${rec.item.toLowerCase()} - $${rec.cost}`);
        } else {
          items.push(`Assess ${rec.item.toLowerCase()}`);
        }
      });
    }

    if (condition === 'requires_repair' || totalCost >= 350) {
      items.push('Schedule technician assessment');
    }

    if (damageLocations.some(d => d.severity === 'critical')) {
      items.push('Consider device replacement');
    }

    if (items.length === 0 && condition !== 'good') {
      items.push('General inspection and cleaning');
    }

    return items;
  };

  const actionItems = getActionItems();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Processing & Documentation
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Review damage assessment, repair recommendations, and add final notes
        </p>
      </div>

      <Form {...form}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Damage Summary */}
          <div className="space-y-6">
            {damageLocations.length > 0 ? (
              <Card className="border-2 border-orange-200 dark:border-orange-800">
                <CardHeader>
                  <CardTitle className="flex items-center text-base">
                    <AlertTriangle className="mr-2 h-5 w-5 text-orange-500" />
                    Damage Summary ({damageLocations.length} issues)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {damageLocations.map((damage, index) => (
                      <div key={damage.id} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex-shrink-0">
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
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {damage.area}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {damage.damageType}
                          </p>
                          {damage.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                              {damage.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-2 border-green-200 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="flex items-center text-base">
                    <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
                    No Damage Detected
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Device appears to be in good condition with no visible damage.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Repair Recommendations */}
            {repairRecommendations.length > 0 && (
              <Card className="border-2 border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="flex items-center text-base">
                    <Wrench className="mr-2 h-5 w-5 text-blue-500" />
                    Repair Recommendations
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
                              className={getPriorityColor(rec.priority)}
                            >
                              {rec.priority} priority
                            </Badge>
                            <span className="text-sm font-medium">{rec.item}</span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {rec.description}
                          </p>
                        </div>
                        <div className="flex-shrink-0 ml-4">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            ${rec.cost}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cost Summary and Documentation */}
          <div className="space-y-6">
            {/* Cost Summary */}
            <Card className="border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <DollarSign className="mr-2 h-5 w-5 text-green-500" />
                  Cost Estimation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {repairRecommendations.length > 0 ? (
                    <>
                      {repairRecommendations.map((rec, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">{rec.item}</span>
                          <span className="font-medium">${rec.cost}</span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between text-base font-semibold">
                        <span>Total Estimated Cost</span>
                        <span className={cn(
                          totalCost >= 350 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"
                        )}>
                          ${totalCost.toFixed(2)}
                        </span>
                      </div>
                      {totalCost >= 350 && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded">
                          <p className="text-xs text-red-700 dark:text-red-300">
                            ⚠️ Cost exceeds replacement threshold. Consider full device replacement.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        No repair costs estimated
                      </p>
                      <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                        $0.00
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Status Assignment */}
            <Card className="border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <CheckCircle className="mr-2 h-5 w-5 text-blue-500" />
                  Status Assignment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">New Status:</span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        getStatusFromCondition() === 'available'
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                      )}
                    >
                      {getStatusFromCondition() === 'available' ? 'Available' : 'Maintenance Required'}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {getStatusFromCondition() === 'available'
                      ? "Device will be marked as available for checkout"
                      : "Device will be sent to maintenance queue"
                    }
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Items */}
            {actionItems.length > 0 && (
              <Card className="border-2 border-purple-200 dark:border-purple-800">
                <CardHeader>
                  <CardTitle className="flex items-center text-base">
                    <FileText className="mr-2 h-5 w-5 text-purple-500" />
                    Generated Action Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {actionItems.map((item, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <div className="flex-shrink-0 w-4 h-4 mt-0.5 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                          <span className="text-xs text-purple-600 dark:text-purple-400 font-bold">
                            {index + 1}
                          </span>
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes and Special Instructions */}
            <Card className="border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <FileText className="mr-2 h-5 w-5 text-gray-500" />
                  Additional Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>General Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any additional notes about the checkin process..."
                          className="min-h-[80px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="specialInstructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Special Instructions</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Special handling instructions for IT staff..."
                          className="min-h-[80px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </Form>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-6">
        <Button
          variant="outline"
          size="lg"
          onClick={onPrevious}
          disabled={isSubmitting}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Assessment</span>
        </Button>
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing Checkin...</span>
            </>
          ) : (
            <>
              <span>Complete Checkin</span>
              <CheckCircle className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
