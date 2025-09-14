import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ValidationResult {
  success: boolean;
  message: string;
  details?: any;
}

export interface PreFlightResults {
  studentData: ValidationResult;
  deviceAvailability: ValidationResult;
  dataCompleteness: ValidationResult;
  systemReadiness: ValidationResult;
  businessRules: ValidationResult;
  overall: boolean;
}

export interface PostFlightResults {
  databaseUpdates: ValidationResult;
  externalSystems: ValidationResult;
  dataConsistency: ValidationResult;
  statusCorrection?: ValidationResult;
  overall: boolean;
}

interface ValidationResultsProps {
  preFlightResults?: PreFlightResults;
  postFlightResults?: PostFlightResults;
  isValidating?: boolean;
  onRetry?: () => void;
  onProceed?: () => void;
  showActions?: boolean;
  title?: string;
}

const ValidationItem: React.FC<{
  label: string;
  result: ValidationResult;
  details?: any;
}> = ({ label, result, details }) => {
  const getIcon = () => {
    if (result.success) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    return result.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400';
  };

  return (
    <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex-shrink-0 mt-0.5">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {label}
          </p>
          <Badge variant={result.success ? "default" : "destructive"} className="ml-2">
            {result.success ? 'PASS' : 'FAIL'}
          </Badge>
        </div>
        <p className={cn("text-sm mt-1", getStatusColor())}>
          {result.message}
        </p>
        {details && (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            {details.warnings && details.warnings.length > 0 && (
              <div className="space-y-1">
                <span className="font-medium text-yellow-600 dark:text-yellow-400">Warnings:</span>
                {details.warnings.map((warning: string, index: number) => (
                  <div key={index} className="flex items-center space-x-2">
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
            {details.issues && details.issues.length > 0 && (
              <div className="space-y-1 mt-2">
                <span className="font-medium text-red-600 dark:text-red-400">Issues:</span>
                {details.issues.map((issue: string, index: number) => (
                  <div key={index} className="flex items-center space-x-2">
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ValidationResults: React.FC<ValidationResultsProps> = ({
  preFlightResults,
  postFlightResults,
  isValidating = false,
  onRetry,
  onProceed,
  showActions = true,
  title = "Validation Results"
}) => {
  const renderPreFlightResults = () => {
    if (!preFlightResults) return null;

    const validationChecks = [
      { key: 'studentData', label: 'Student Data Integrity', result: preFlightResults.studentData },
      { key: 'deviceAvailability', label: 'Device Availability', result: preFlightResults.deviceAvailability },
      { key: 'dataCompleteness', label: 'Data Completeness', result: preFlightResults.dataCompleteness },
      { key: 'systemReadiness', label: 'System Readiness', result: preFlightResults.systemReadiness },
      { key: 'businessRules', label: 'Business Rules', result: preFlightResults.businessRules }
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Pre-Flight Checks</h4>
          <Badge
            variant={preFlightResults.overall ? "default" : "destructive"}
            className="text-xs"
          >
            {preFlightResults.overall ? 'ALL PASSED' : 'SOME FAILED'}
          </Badge>
        </div>

        <div className="space-y-3">
          {validationChecks.map(({ key, label, result }) => (
            <ValidationItem
              key={key}
              label={label}
              result={result}
              details={result.details}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderPostFlightResults = () => {
    if (!postFlightResults) return null;

    const validationChecks = [
      { key: 'databaseUpdates', label: 'Database Updates', result: postFlightResults.databaseUpdates },
      { key: 'externalSystems', label: 'External Systems', result: postFlightResults.externalSystems },
      { key: 'dataConsistency', label: 'Data Consistency', result: postFlightResults.dataConsistency }
    ];

    if (postFlightResults.statusCorrection) {
      validationChecks.push({
        key: 'statusCorrection',
        label: 'Status Correction',
        result: postFlightResults.statusCorrection
      });
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Post-Flight Verification</h4>
          <Badge
            variant={postFlightResults.overall ? "default" : "destructive"}
            className="text-xs"
          >
            {postFlightResults.overall ? 'ALL PASSED' : 'SOME FAILED'}
          </Badge>
        </div>

        <div className="space-y-3">
          {validationChecks.map(({ key, label, result }) => (
            <ValidationItem
              key={key}
              label={label}
              result={result}
              details={result.details}
            />
          ))}
        </div>
      </div>
    );
  };

  const getOverallStatus = () => {
    if (isValidating) return 'validating';
    if (preFlightResults && !preFlightResults.overall) return 'failed';
    if (postFlightResults && !postFlightResults.overall) return 'failed';
    if (preFlightResults?.overall && (!postFlightResults || postFlightResults.overall)) return 'passed';
    return 'unknown';
  };

  const overallStatus = getOverallStatus();

  const getStatusIcon = () => {
    switch (overallStatus) {
      case 'validating':
        return <RefreshCw className="h-6 w-6 text-blue-500 animate-spin" />;
      case 'passed':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'failed':
        return <XCircle className="h-6 w-6 text-red-500" />;
      default:
        return <Clock className="h-6 w-6 text-gray-500" />;
    }
  };

  const getStatusMessage = () => {
    switch (overallStatus) {
      case 'validating':
        return 'Running validation checks...';
      case 'passed':
        return 'All validation checks passed successfully';
      case 'failed':
        return 'Some validation checks failed';
      default:
        return 'Validation status unknown';
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
      <CardContent className="space-y-6">
        {isValidating && (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Please wait while we validate the checkout requirements...
            </p>
          </div>
        )}

        {!isValidating && (
          <>
            {renderPreFlightResults()}
            {preFlightResults && postFlightResults && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6" />
            )}
            {renderPostFlightResults()}
          </>
        )}

        {showActions && !isValidating && (
          <div className="flex justify-between items-center pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex space-x-3">
              {onRetry && (
                <Button
                  variant="outline"
                  onClick={onRetry}
                  className="flex items-center space-x-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry Validation</span>
                </Button>
              )}
            </div>

            {onProceed && (
              <Button
                onClick={onProceed}
                disabled={overallStatus === 'failed'}
                className={cn(
                  "flex items-center space-x-2",
                  overallStatus === 'failed' && "opacity-50 cursor-not-allowed"
                )}
              >
                <CheckCircle className="h-4 w-4" />
                <span>
                  {overallStatus === 'passed' ? 'Proceed with Checkout' : 'Cannot Proceed'}
                </span>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ValidationResults;
