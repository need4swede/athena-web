import React, { useState, useEffect } from 'react';
import { CheckCircle, Loader2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidationStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  error?: string;
}

interface CheckoutValidationAnimationProps {
  onComplete: (success: boolean, failedStep?: string) => void;
  onValidationStep: (stepId: string) => Promise<boolean>;
  steps: Omit<ValidationStep, 'status'>[];
}

export const CheckoutValidationAnimation: React.FC<CheckoutValidationAnimationProps> = ({
  onComplete,
  onValidationStep,
  steps: initialSteps
}) => {
  const [steps, setSteps] = useState<ValidationStep[]>(
    initialSteps.map(step => ({ ...step, status: 'pending' }))
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const runValidation = async () => {
      for (let i = 0; i < steps.length; i++) {
        // Start the current step
        setCurrentStepIndex(i);
        setSteps(prev => prev.map((step, index) =>
          index === i ? { ...step, status: 'running' } : step
        ));

        // Add a small delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          // Run the validation for this step
          const success = await onValidationStep(steps[i].id);

          if (success) {
            // Mark as success
            setSteps(prev => prev.map((step, index) =>
              index === i ? { ...step, status: 'success' } : step
            ));

            // Wait a bit before starting next step
            await new Promise(resolve => setTimeout(resolve, 800));
          } else {
            // Mark as error
            setSteps(prev => prev.map((step, index) =>
              index === i ? { ...step, status: 'error', error: 'Validation failed' } : step
            ));

            // Wait before calling onComplete
            await new Promise(resolve => setTimeout(resolve, 1000));
            setIsComplete(true);
            onComplete(false, steps[i].id);
            return;
          }
        } catch (error) {
          // Mark as error
          setSteps(prev => prev.map((step, index) =>
            index === i ? {
              ...step,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            } : step
          ));

          // Wait before calling onComplete
          await new Promise(resolve => setTimeout(resolve, 1000));
          setIsComplete(true);
          onComplete(false, steps[i].id);
          return;
        }
      }

      // All steps completed successfully
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsComplete(true);
      onComplete(true);
    };

    runValidation();
  }, []);

  const getStepIcon = (step: ValidationStep, index: number) => {
    switch (step.status) {
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <X className="h-5 w-5 text-red-500" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStepTextColor = (step: ValidationStep) => {
    switch (step.status) {
      case 'running':
        return 'text-blue-600 dark:text-blue-400';
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  const getStepOpacity = (index: number) => {
    if (index > currentStepIndex) {
      return 'opacity-0'; // Not yet visible
    } else if (index === currentStepIndex) {
      return 'opacity-100'; // Current step - full opacity
    } else {
      return 'opacity-60'; // Completed steps - reduced opacity
    }
  };

  const getStepTransform = (index: number) => {
    if (index > currentStepIndex) {
      return 'translate-y-8'; // Start below
    } else {
      const offset = (currentStepIndex - index) * -8; // Move up as new steps appear
      return `translate-y-[${offset}px]`;
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg p-8">
        <div className="text-center mb-8">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Processing Checkout
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Please wait while we validate and process your checkout...
          </p>
        </div>

        <div className="space-y-4 relative min-h-[300px]">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center space-x-4 transition-all duration-700 ease-in-out transform",
                getStepOpacity(index),
                index <= currentStepIndex ? 'translate-y-0' : 'translate-y-8'
              )}
              style={{
                transitionDelay: index <= currentStepIndex ? `${(index) * 100}ms` : '0ms'
              }}
            >
              <div className="flex-shrink-0">
                {getStepIcon(step, index)}
              </div>

              <div className="flex-1 min-w-0">
                <div className={cn(
                  "text-base font-medium transition-colors duration-300",
                  getStepTextColor(step)
                )}>
                  {step.label}
                </div>

                {step.status === 'error' && step.error && (
                  <div className="text-sm text-red-500 dark:text-red-400 mt-1">
                    {step.error}
                  </div>
                )}
              </div>

              {step.status === 'running' && (
                <div className="flex-shrink-0">
                  <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                    Processing...
                  </div>
                </div>
              )}

              {step.status === 'success' && (
                <div className="flex-shrink-0">
                  <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                    Complete
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Progress indicator */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Progress</span>
              <span>
                {steps.filter(s => s.status === 'success').length} of {steps.length} complete
              </span>
            </div>
            <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${(steps.filter(s => s.status === 'success').length / steps.length) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
