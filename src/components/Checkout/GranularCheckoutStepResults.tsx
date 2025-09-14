import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface GranularCheckoutStep {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  retryCount: number;
  canRetry: boolean;
  details?: any;
}

export interface GranularCheckoutStatus {
  sessionId: string;
  overallStatus: string;
  currentStep: string;
  steps: GranularCheckoutStep[];
  checkoutId?: number;
  paymentTransactionId?: string;
}

interface GranularCheckoutStepResultsProps {
  checkoutStatus?: GranularCheckoutStatus;
  validationError?: string;
  onRetryStep?: (stepName: string) => void;
  onRetryAll?: () => void;
  onForceComplete?: () => void;
  isProcessing?: boolean;
  title?: string;
}

const STEP_DESCRIPTIONS = {
  'validate_student_info': {
    label: 'Validate Student Information',
    description: 'Verifying student data integrity and existence'
  },
  'validate_device_availability': {
    label: 'Validate Device Availability',
    description: 'Checking if device is available for checkout'
  },
  'validate_data_completeness': {
    label: 'Validate Data Completeness',
    description: 'Ensuring all required checkout data is present'
  },
  'create_or_validate_student': {
    label: 'Create/Validate Student Record',
    description: 'Creating or validating student database record'
  },
  'update_device_status': {
    label: 'Update Device Status',
    description: 'Updating device status and assignment in database'
  },
  'create_checkout_history': {
    label: 'Create Checkout History',
    description: 'Creating checkout history record'
  },
  'process_insurance_fee': {
    label: 'Process Insurance Fee',
    description: 'Processing insurance fee if applicable'
  },
  'process_insurance_payment': {
    label: 'Process Insurance Payment',
    description: 'Processing insurance payment if provided'
  },
  'create_device_history': {
    label: 'Create Device History',
    description: 'Creating device history entry'
  },
  'generate_pdf_agreement': {
    label: 'Generate PDF Agreement',
    description: 'Generating checkout agreement PDF document'
  },
  'update_google_notes': {
    label: 'Update Google Notes',
    description: 'Updating device notes in Google Admin (if enabled)'
  }
};

const StepItem: React.FC<{
  step: GranularCheckoutStep;
  onRetry?: (stepName: string) => void;
  isRetrying?: boolean;
}> = ({ step, onRetry, isRetrying = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const stepInfo = STEP_DESCRIPTIONS[step.name as keyof typeof STEP_DESCRIPTIONS];

  const getIcon = () => {
    if (isRetrying) {
      return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
    }

    switch (step.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-400" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (step.status) {
      case 'completed':
        return 'text-green-700 dark:text-green-400';
      case 'failed':
        return 'text-red-700 dark:text-red-400';
      case 'processing':
        return 'text-blue-700 dark:text-blue-400';
      case 'pending':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getBadgeVariant = () => {
    switch (step.status) {
      case 'completed':
        return 'default' as const;
      case 'failed':
        return 'destructive' as const;
      case 'processing':
        return 'secondary' as const;
      case 'pending':
        return 'outline' as const;
      default:
        return 'outline' as const;
    }
  };

  const getBadgeText = () => {
    switch (step.status) {
      case 'completed':
        return 'COMPLETED';
      case 'failed':
        return 'FAILED';
      case 'processing':
        return 'PROCESSING';
      case 'pending':
        return 'PENDING';
      default:
        return 'UNKNOWN';
    }
  };

  const hasDetails = step.error || step.details || step.retryCount > 0;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-start space-x-3 p-4">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {stepInfo?.label || step.name}
              </p>
              {hasDetails && (
                <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-0 h-auto text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant={getBadgeVariant()} className="text-xs">
                {getBadgeText()}
              </Badge>
              {step.status === 'failed' && step.canRetry && onRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRetry(step.name)}
                  disabled={isRetrying}
                  className="h-6 px-2 text-xs"
                >
                  {isRetrying ? 'Retrying...' : 'Retry'}
                </Button>
              )}
            </div>
          </div>

          {stepInfo?.description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {stepInfo.description}
            </p>
          )}

          {hasDetails && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleContent className="space-y-2">
                {step.error && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
                    <div className="flex items-start space-x-2">
                      <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                          Error Details
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
                          {step.error}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {step.retryCount > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        Retry attempts: {step.retryCount}
                      </p>
                    </div>
                  </div>
                )}

                {step.details && typeof step.details === 'object' && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                      Additional Details
                    </p>
                    <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                      {JSON.stringify(step.details, null, 2)}
                    </pre>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
};

export const GranularCheckoutStepResults: React.FC<GranularCheckoutStepResultsProps> = ({
  checkoutStatus,
  validationError,
  onRetryStep,
  onRetryAll,
  onForceComplete,
  isProcessing = false,
  title = "Granular Checkout Process"
}) => {
  const [retryingSteps, setRetryingSteps] = useState<Set<string>>(new Set());

  const handleRetryStep = async (stepName: string) => {
    if (!onRetryStep) return;

    setRetryingSteps(prev => new Set(prev).add(stepName));
    try {
      await onRetryStep(stepName);
    } finally {
      setRetryingSteps(prev => {
        const next = new Set(prev);
        next.delete(stepName);
        return next;
      });
    }
  };

  const getOverallStatus = () => {
    if (isProcessing) return 'processing';
    if (!checkoutStatus) return 'unknown';

    const failedSteps = checkoutStatus.steps.filter(step => step.status === 'failed');
    const completedSteps = checkoutStatus.steps.filter(step => step.status === 'completed');

    if (failedSteps.length > 0) return 'failed';
    if (completedSteps.length === checkoutStatus.steps.length) return 'completed';
    return 'in_progress';
  };

  const overallStatus = getOverallStatus();

  const getStatusIcon = () => {
    switch (overallStatus) {
      case 'processing':
      case 'in_progress':
        return <RefreshCw className="h-6 w-6 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'failed':
        return <XCircle className="h-6 w-6 text-red-500" />;
      default:
        return <Clock className="h-6 w-6 text-gray-500" />;
    }
  };

  const getStatusMessage = () => {
    if (!checkoutStatus) {
      return 'No checkout status available';
    }

    const completedSteps = checkoutStatus.steps.filter(step => step.status === 'completed').length;
    const totalSteps = checkoutStatus.steps.length;
    const failedSteps = checkoutStatus.steps.filter(step => step.status === 'failed');

    switch (overallStatus) {
      case 'processing':
        return 'Processing checkout steps...';
      case 'in_progress':
        return `Progress: ${completedSteps}/${totalSteps} steps completed`;
      case 'completed':
        return `All ${totalSteps} checkout steps completed successfully`;
      case 'failed':
        return `${failedSteps.length} step(s) failed, ${completedSteps} completed`;
      default:
        return 'Checkout status unknown';
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <span className="text-xl">{title}</span>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-normal mt-1">
              {getStatusMessage()}
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isProcessing && !checkoutStatus && (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Please wait while we process the checkout...
            </p>
          </div>
        )}

        {validationError && !checkoutStatus && (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-start space-x-3">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">
                  Checkout Failed
                </h4>
                <p className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
                  {validationError}
                </p>
              </div>
            </div>
          </div>
        )}

        {checkoutStatus && (
          <>
            <div className="space-y-3">
              {checkoutStatus.steps.map((step) => (
                <StepItem
                  key={step.name}
                  step={step}
                  onRetry={onRetryStep ? handleRetryStep : undefined}
                  isRetrying={retryingSteps.has(step.name)}
                />
              ))}
            </div>

            {checkoutStatus.sessionId && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded border">
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <div><strong>Session ID:</strong> {checkoutStatus.sessionId}</div>
                  <div><strong>Overall Status:</strong> {checkoutStatus.overallStatus}</div>
                  <div><strong>Current Step:</strong> {checkoutStatus.currentStep}</div>
                  {checkoutStatus.checkoutId && (
                    <div><strong>Checkout ID:</strong> {checkoutStatus.checkoutId}</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex space-x-3">
            {onRetryAll && overallStatus === 'failed' && (
              <Button
                variant="outline"
                onClick={onRetryAll}
                disabled={isProcessing}
                className="flex items-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry All Failed Steps</span>
              </Button>
            )}
          </div>

          <div className="flex space-x-3">
            {onForceComplete && overallStatus === 'failed' && (
              <Button
                onClick={onForceComplete}
                className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Force Complete</span>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default GranularCheckoutStepResults;
