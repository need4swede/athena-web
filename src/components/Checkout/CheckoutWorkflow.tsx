import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle, User, Laptop, FileText, ArrowRight, ArrowLeft, Loader2, Plus, X, Shield, ShieldCheck, Printer, DollarSign, AlertTriangle, CreditCard, Search } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/components/sso/SSOProvider';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Chromebook } from '@/types/chromebook';
import { getInsuranceStatusDisplay } from '@/lib/insurance-utils';
import { SignatureCapture, SignatureCaptureHandle } from './SignatureCapture';
import AgreementPreview from './AgreementPreview';
import { StudentFee } from '@/types/fees';
import { AddPaymentDialog } from '../Users/StudentFees';
import ValidationResults, { PreFlightResults, PostFlightResults } from './ValidationResults';
import { CheckoutValidationAnimation } from './CheckoutValidationAnimation';
import GranularCheckoutStepResults, { GranularCheckoutStatus } from './GranularCheckoutStepResults';

const checkoutFormSchema = z.object({
  agreementType: z.string().default('standard'),
  notes: z.string().optional(),
  insurance: z.string().optional(),
  insurancePayment: z.string().optional(),
  signature: z.string().optional(),
  parentSignature: z.string().optional(),
  parentPresent: z.boolean().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;

interface PaymentDetails {
  paymentMethod: string;
  amount: number;
  notes: string;
}

interface CheckoutWorkflowProps {
  student: {
    firstName: string;
    lastName: string;
    studentId: string;
    email: string;
    id?: number; // student database ID
  };
  chromebook: Chromebook;
  onReset?: () => void;
}

type WorkflowStep = 'review' | 'device-pending-signature' | 'device-status-check' | 'parental-consent' | 'outstanding-fees' | 'details' | 'insurance-payment' | 'payment-processing' | 'agreement' | 'signature' | 'parent-signature' | 'confirmation';

export const CheckoutWorkflow: React.FC<CheckoutWorkflowProps> = ({ student, chromebook }) => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('review');
  const [parentPresent, setParentPresent] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showNotesField, setShowNotesField] = useState(false);
  const [checkoutId, setCheckoutId] = useState<number | null>(null);
  const [outstandingFees, setOutstandingFees] = useState<StudentFee[]>([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [ltcFee, setLtcFee] = useState<number>(40);
  const [currentDevices, setCurrentDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceStatusCheck, setDeviceStatusCheck] = useState<any>(null);
  const [deviceStatusLoading, setDeviceStatusLoading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({
    paymentMethod: 'Cash',
    amount: 0,
    notes: ''
  });
  const [previousPayments, setPreviousPayments] = useState<any[]>([]);
  const [appliedPreviousPayments, setAppliedPreviousPayments] = useState<any[]>([]);
  const [loadingPreviousPayments, setLoadingPreviousPayments] = useState(false);

  // Validation states
  const [preFlightResults, setPreFlightResults] = useState<PreFlightResults | null>(null);
  const [postFlightResults, setPostFlightResults] = useState<PostFlightResults | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStep, setValidationStep] = useState<'none' | 'pre-flight' | 'post-flight'>('none');

  // Signature validation states
  const [hasStudentSignature, setHasStudentSignature] = useState(false);
  const [hasParentSignature, setHasParentSignature] = useState(false);

  // Animation states
  const [showValidationAnimation, setShowValidationAnimation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showValidationResults, setShowValidationResults] = useState(false);
  const [validationFailureStep, setValidationFailureStep] = useState<'none' | 'processing-checkout' | 'updating-status'>('none');

  // Granular checkout tracking
  const [granularCheckoutStatus, setGranularCheckoutStatus] = useState<GranularCheckoutStatus | null>(null);
  const [showGranularCheckoutResults, setShowGranularCheckoutResults] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Define validation steps for animation
  const validationSteps = [
    { id: 'student-data', label: 'Validating student information...' },
    { id: 'device-availability', label: 'Checking device availability...' },
    { id: 'data-completeness', label: 'Verifying data completeness...' },
    { id: 'processing-checkout', label: 'Processing checkout...' },
    { id: 'updating-status', label: 'Updating device status...' },
    { id: 'finalizing', label: 'Finalizing agreement...' }
  ];

  const { token } = useAuth();
  const studentSignaturePadRef = useRef<SignatureCaptureHandle>(null);
  const parentSignaturePadRef = useRef<SignatureCaptureHandle>(null);
  const tempCheckoutIdRef = useRef<number | null>(null);

  // Validation functions
  const runPreFlightValidation = async () => {
    setIsValidating(true);
    setValidationStep('pre-flight');

    try {
      const validationData = {
        chromebook_id: chromebook.id,
        student_id: student.studentId,
        parent_present: parentPresent || false,
        signature: form.getValues('signature'),
        parent_signature: form.getValues('parentSignature'),
        insurance: form.getValues('insurance'),
        insurance_payment: form.getValues('insurancePayment') === 'pay_now' ? {
          payment_method: paymentDetails.paymentMethod,
          amount: paymentDetails.amount,
          notes: paymentDetails.notes,
          ltc_fee: ltcFee,
          applied_previous_payments: appliedPreviousPayments.map(p => ({
            id: p.id,
            amount: Number(p.amount),
            payment_method: p.payment_method,
            transaction_id: p.transaction_id
          })),
          total_payment: paymentDetails.amount + appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0)
        } : undefined
      };

      const response = await fetch('/api/validation/checkout/pre-flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(validationData),
      });

      if (!response.ok) {
        throw new Error('Validation request failed');
      }

      const result = await response.json();
      setPreFlightResults(result.results);

      return result.results.overall;
    } catch (error) {
      console.error('Pre-flight validation error:', error);
      toast({
        title: "Critical Validation Error",
        description: "Failed to run pre-flight validation checks. This may indicate a system issue or connectivity problem. Please check your connection and try again.",
        variant: "destructive",
        duration: Infinity // Never auto-expire for critical errors
      });
      return false;
    } finally {
      setIsValidating(false);
      setValidationStep('none');
    }
  };

  const handleRetryValidation = async () => {
    // Clear previous results
    setPreFlightResults(null);

    // Re-run pre-flight validation
    const validationPassed = await runPreFlightValidation();

    if (validationPassed) {
      toast({
        title: "Validation Successful",
        description: "All pre-flight checks passed. You may now proceed with checkout.",
      });
    }
  };

  const handleClearValidation = () => {
    setPreFlightResults(null);
    setPostFlightResults(null);
    setGranularCheckoutStatus(null);
    setShowGranularCheckoutResults(false);
    setCurrentSessionId(null);
  };

  // Fetch granular checkout status
  const fetchGranularCheckoutStatus = async (sessionId: string): Promise<GranularCheckoutStatus | null> => {
    try {
      const response = await fetch(`/api/checkouts/sessions/${sessionId}/status`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        const result = await response.json();
        return result;
      }
    } catch (error) {
      console.error('Error fetching granular checkout status:', error);
    }
    return null;
  };

  // Retry individual granular checkout step
  const handleRetryGranularStep = async (stepName: string) => {
    if (!currentSessionId) return;

    try {
      const response = await fetch(`/api/checkouts/sessions/${currentSessionId}/retry/${stepName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        // Refresh the granular checkout status
        const updatedStatus = await fetchGranularCheckoutStatus(currentSessionId);
        if (updatedStatus) {
          setGranularCheckoutStatus(updatedStatus);

          // Check if all steps are now completed
          if (updatedStatus.overallStatus === 'completed') {
            setShowGranularCheckoutResults(false);
            setIsCompleted(true);
            setCurrentStep('confirmation');
            toast({
              title: "Checkout Completed!",
              description: "All steps completed successfully after retry.",
            });
          } else {
            toast({
              title: "Step Retry Result",
              description: `Step ${stepName} retry attempt completed. Check the results below.`,
            });
          }
        }
      } else {
        const error = await response.json();
        toast({
          title: "Retry Failed",
          description: error.message || `Failed to retry step: ${stepName}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error retrying granular step:', error);
      toast({
        title: "Retry Error",
        description: "Failed to retry the step. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Retry all failed granular checkout steps
  const handleRetryAllGranularSteps = async () => {
    if (!currentSessionId) return;

    try {
      const response = await fetch(`/api/checkouts/sessions/${currentSessionId}/process-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        const result = await response.json();
        const updatedStatus = result.sessionStatus;
        setGranularCheckoutStatus(updatedStatus);

        if (updatedStatus.overallStatus === 'completed') {
          setShowGranularCheckoutResults(false);
          setIsCompleted(true);
          setCurrentStep('confirmation');
          toast({
            title: "Checkout Completed!",
            description: "All steps completed successfully after retry.",
          });
        } else {
          toast({
            title: "Retry All Result",
            description: "Retry attempt completed. Check the results below for any remaining issues.",
          });
        }
      } else {
        const error = await response.json();
        toast({
          title: "Retry All Failed",
          description: error.message || "Failed to retry all steps",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error retrying all granular steps:', error);
      toast({
        title: "Retry Error",
        description: "Failed to retry all steps. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Signature tracking functions
  const handleStudentSignatureChange = (signature: string) => {
    setHasStudentSignature(!!signature && signature.trim() !== '');
  };

  const handleParentSignatureChange = (signature: string) => {
    setHasParentSignature(!!signature && signature.trim() !== '');
  };

  const checkSignaturePresence = (padRef: React.RefObject<SignatureCaptureHandle>) => {
    if (padRef.current) {
      const signature = padRef.current.getSignature();
      return !!signature && signature.trim() !== '';
    }
    return false;
  };

  // Clear signature handlers
  const handleClearStudentSignature = () => {
    if (studentSignaturePadRef.current) {
      studentSignaturePadRef.current.clear();
    }
  };

  const handleClearParentSignature = () => {
    if (parentSignaturePadRef.current) {
      parentSignaturePadRef.current.clear();
    }
  };

  // Handle individual validation steps for animation
  const handleValidationStep = async (stepId: string): Promise<boolean> => {
    try {
      let result = false;

      switch (stepId) {
        case 'student-data':
          // Validate student information (real-time, no delay)
          result = !!student.studentId && !!student.firstName && !!student.lastName;
          if (!result) {
            setValidationError('Student information is incomplete. Please verify the student data.');
          }
          return result;

        case 'device-availability':
          // Check device availability (real-time, no delay)
          result = chromebook.status === 'available';
          if (!result) {
            setValidationError(`Device ${chromebook.assetTag} is not available for checkout. Current status: ${chromebook.status}`);
          }
          return result;

        case 'data-completeness':
          // Verify all required data is present (real-time, no delay)
          const hasSignatures = parentPresent ?
            (!!form.getValues('signature') && !!form.getValues('parentSignature')) :
            !!form.getValues('signature');
          result = hasSignatures;
          if (!result) {
            const missingSignatures = [];
            if (!form.getValues('signature')) missingSignatures.push('student signature');
            if (parentPresent && !form.getValues('parentSignature')) missingSignatures.push('parent signature');
            setValidationError(`Missing required signatures: ${missingSignatures.join(', ')}`);
          }
          return result;

        case 'processing-checkout':
          // CRITICAL: Run pre-flight validation first before attempting checkout
          console.log('🔍 [Validation] Running mandatory pre-flight validation before checkout...');

          const preFlightPassed = await runPreFlightValidation();
          if (!preFlightPassed) {
            setValidationError('Pre-flight validation failed. Device checkout has been blocked to prevent issues.');
            return false;
          }

          // Execute the actual checkout using GRANULAR CHECKOUT SYSTEM
          const checkoutData: any = {
            chromebook_id: chromebook.id,
            student_id: student.studentId,
            notes: form.getValues('notes') || null,
            agreement_type: form.getValues('agreementType'),
            signature: form.getValues('signature'),
            parent_signature: form.getValues('parentSignature'),
            parent_present: parentPresent,
          };

          if (parentPresent) {
            checkoutData.insurance = form.getValues('insurance');
            if (form.getValues('insurancePayment') === 'pay_now') {
              // Calculate total payment including applied previous payments
              const appliedTotal = appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
              const totalPayment = paymentDetails.amount + appliedTotal;

              checkoutData.insurance_payment = {
                amount: paymentDetails.amount,
                payment_method: paymentDetails.paymentMethod,
                notes: paymentDetails.notes,
                ltc_fee: ltcFee,
                applied_previous_payments: appliedPreviousPayments.map(p => ({
                  id: p.id,
                  amount: Number(p.amount),
                  payment_method: p.payment_method,
                  transaction_id: p.transaction_id
                })),
                total_payment: totalPayment
              };
            }
          }

          console.log('✅ [Validation] Pre-flight validation passed. Starting granular checkout session...');

          // Step 1: Start checkout session
          const sessionResponse = await fetch('/api/checkouts/sessions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { 'Authorization': `Bearer ${token}` }),
            },
            body: JSON.stringify(checkoutData),
          });

          if (!sessionResponse.ok) {
            const error = await sessionResponse.json();
            const detailedError = error.message || error.error || 'Failed to start checkout session';
            console.error('❌ [Validation] Session start failed:', detailedError);
            setValidationError(detailedError);
            throw new Error(detailedError);
          }

          const sessionResult = await sessionResponse.json();
          const sessionId = sessionResult.sessionId;
          console.log('✅ [Validation] Checkout session started:', sessionId);

          // Store session ID for granular tracking
          setCurrentSessionId(sessionId);

          // Step 2: Process all checkout steps
          const processResponse = await fetch(`/api/checkouts/sessions/${sessionId}/process-all`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { 'Authorization': `Bearer ${token}` }),
            },
          });

          if (processResponse.ok) {
            const processResult = await processResponse.json();
            const finalStatus = processResult.sessionStatus;

            // ALWAYS capture granular checkout status for display
            console.log('📊 [Validation] Capturing granular checkout status:', finalStatus);
            setGranularCheckoutStatus(finalStatus);

            if (finalStatus.overallStatus === 'completed' && finalStatus.checkoutId) {
              console.log('✅ [Validation] Granular checkout completed successfully:', finalStatus.checkoutId);
              tempCheckoutIdRef.current = finalStatus.checkoutId;
              setCheckoutId(finalStatus.checkoutId);
              // Don't show granular results on success, let normal flow continue
              setShowGranularCheckoutResults(false);
              return true;
            } else {
              // Show granular checkout status for failed/incomplete steps
              setShowGranularCheckoutResults(true);

              // Check for failed steps and set detailed error messages
              const failedSteps = finalStatus.steps.filter((step: any) => step.status === 'failed');
              if (failedSteps.length > 0) {
                const stepErrors = failedSteps.map((step: any) => `${step.name}: ${step.error}`).join('\n');
                const detailedError = `Granular checkout failed at the following steps:\n${stepErrors}`;
                console.error('❌ [Validation] Granular checkout failed:', detailedError);
                setValidationError(detailedError);
                // Don't throw error - return false to let animation handler show granular results
                return false;
              } else {
                const detailedError = 'Granular checkout did not complete successfully';
                console.error('❌ [Validation] Granular checkout incomplete:', detailedError);
                setValidationError(detailedError);
                // Don't throw error - return false to let animation handler show granular results
                return false;
              }
            }
          } else {
            const error = await processResponse.json();
            let detailedError = error.message || error.error || 'Granular checkout processing failed';

            // Try to get granular status even on failure
            try {
              const granularStatus = await fetchGranularCheckoutStatus(sessionId);
              if (granularStatus) {
                console.log('📊 [Validation] Captured granular status after failure:', granularStatus);
                setGranularCheckoutStatus(granularStatus);
                setShowGranularCheckoutResults(true);
              }
            } catch (granularError) {
              console.warn('Could not fetch granular status after failure:', granularError);
            }

            console.error('❌ [Validation] Granular checkout failed:', detailedError);
            setValidationError(detailedError);

            // Show persistent toast for validation failures
            toast({
              title: "Checkout Processing Failed",
              description: detailedError,
              variant: "destructive",
              duration: Infinity
            });

            throw new Error(detailedError);
          }

        case 'updating-status':
          // Verify checkout was processed correctly (real-time, no delay)
          const currentCheckoutId = tempCheckoutIdRef.current || checkoutId;
          if (currentCheckoutId) {
            const expectedStatus = parentPresent ? 'checked_out' : 'pending_signature';
            console.log(`🔍 [Validation] Verifying device status update to: ${expectedStatus}`);
            result = await runPostFlightValidation(currentCheckoutId, expectedStatus);
            if (!result) {
              setValidationError('Device status verification failed. The checkout may not have completed properly.');
            }
          } else {
            result = true;
          }
          return result;

        case 'finalizing':
          // Final checks and cleanup (real-time, no delay)
          tempCheckoutIdRef.current = null;
          result = true;
          console.log('✅ [Validation] Checkout process finalized successfully');
          return result;

        default:
          return true;
      }
    } catch (error) {
      console.error(`❌ [Validation] Validation step ${stepId} failed:`, error);
      setValidationError(error instanceof Error ? error.message : 'Unknown validation error occurred');
      return false;
    }
  };

  const runPostFlightValidation = async (checkoutId: number, expectedStatus: string) => {
    setIsValidating(true);
    setValidationStep('post-flight');

    try {
      const validationData = {
        chromebook_id: chromebook.id,
        student_id: student.studentId,
        expected_status: expectedStatus,
        checkout_id: checkoutId,
        asset_tag: chromebook.assetTag
      };

      const response = await fetch('/api/validation/checkout/post-flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(validationData),
      });

      if (!response.ok) {
        throw new Error('Post-flight validation request failed');
      }

      const result = await response.json();
      setPostFlightResults(result.results);

      return result.results.overall;
    } catch (error) {
      console.error('Post-flight validation error:', error);
      toast({
        title: "Post-Flight Validation Error",
        description: "Failed to verify checkout completion",
        variant: "destructive",
        duration: Infinity
      });
      return false;
    } finally {
      setIsValidating(false);
      setValidationStep('none');
    }
  };

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      agreementType: 'standard',
      notes: '',
      insurance: undefined,
      signature: '',
      parentSignature: '',
    },
  });

  // Fetch outstanding fees for the student
  const fetchOutstandingFees = async () => {
    if (!student.id) return;

    setFeesLoading(true);
    try {
      const response = await fetch(`/api/students/${student.id}/fees`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        const fees = await response.json();
        const unpaidFees = fees.filter((fee: StudentFee) => fee.balance && fee.balance > 0);
        setOutstandingFees(unpaidFees);
      }
    } catch (error) {
      console.error('Error fetching student fees:', error);
    } finally {
      setFeesLoading(false);
    }
  };

  // Fetch LTC fee from config
  const fetchLtcFee = async () => {
    try {
      const response = await fetch('/api/checkouts/config/fees', {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });
      if (response.ok) {
        const config = await response.json();
        setLtcFee(config.ltcFee || 40);
      }
    } catch (error) {
      console.error('Error fetching LTC fee:', error);
    }
  };

  // Fetch previous insurance payments for the student
  const fetchPreviousPayments = async () => {
    if (!student.id) return;

    setLoadingPreviousPayments(true);
    try {
      console.log(`🔍 [Frontend] Fetching previous insurance payments for student ID: ${student.id}`);
      const response = await fetch(`/api/students/${student.id}/previous-insurance-payments?debug=true`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        const responseData = await response.json();
        console.log(`📥 [Frontend] Raw API response:`, responseData);

        // Handle both development (with debug info) and production formats
        const payments = responseData.payments || responseData;
        console.log(`💰 [Frontend] Extracted payments:`, payments);
        console.log(`📊 [Frontend] Setting ${payments.length} previous payments in state`);

        setPreviousPayments(payments);
      } else {
        console.error(`❌ [Frontend] API response not ok:`, response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ [Frontend] Error fetching previous insurance payments:', error);
    } finally {
      setLoadingPreviousPayments(false);
    }
  };

  // Memoized available payments to prevent inconsistent filtering during render
  const availablePayments = useMemo(() => {
    console.log('🔍 [Memo] Recalculating available payments');
    console.log('🔍 [Memo] Previous payments:', previousPayments.map(p => ({ transaction_id: p.transaction_id, amount: p.amount })));
    console.log('🔍 [Memo] Applied payments:', appliedPreviousPayments.map(p => ({ transaction_id: p.transaction_id, amount: p.amount })));

    const available = previousPayments.filter(payment =>
      !appliedPreviousPayments.find(applied => applied.transaction_id === payment.transaction_id)
    );

    console.log('🔍 [Memo] Filtered available payments:', available.map(p => ({ transaction_id: p.transaction_id, amount: p.amount })));
    return available;
  }, [previousPayments, appliedPreviousPayments]);

  // Apply a previous payment to reduce the current amount owed
  const applyPreviousPayment = (payment: any) => {
    console.log('🔍 [Frontend] Applying payment:', payment.transaction_id, 'Amount:', payment.amount);
    console.log('🔍 [Frontend] Payment object:', payment);
    console.log('🔍 [Frontend] Current appliedPreviousPayments before:', appliedPreviousPayments.map(p => ({ transaction_id: p.transaction_id, amount: p.amount })));
    setAppliedPreviousPayments(prev => [...prev, payment]);
  };

  // Apply all available previous payments
  const applyAllPreviousPayments = () => {
    if (availablePayments.length === 0) return;

    console.log('🔍 [Frontend] Applying all payments:', availablePayments.map(p => ({ transaction_id: p.transaction_id, amount: p.amount })));
    setAppliedPreviousPayments(prev => [...prev, ...availablePayments]);
  };

  // Remove an applied previous payment
  const removeAppliedPayment = (paymentTransactionId: string) => {
    console.log('🔍 [Frontend] Removing payment:', paymentTransactionId);
    setAppliedPreviousPayments(prev => prev.filter(p => p.transaction_id !== paymentTransactionId));
  };

  // Update payment amount whenever applied payments change
  useEffect(() => {
    const totalApplied = appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const newAmount = Math.max(0, ltcFee - totalApplied);

    console.log('🔍 [Frontend] Payment amount recalculation:');
    console.log('  - Applied payments:', appliedPreviousPayments.map(p => ({ transaction_id: p.transaction_id, amount: p.amount })));
    console.log('  - Total applied:', totalApplied);
    console.log('  - LTC fee:', ltcFee);
    console.log('  - New amount:', newAmount);
    console.log('  - Available payments count:', availablePayments.length);

    setPaymentDetails(prev => ({ ...prev, amount: newAmount }));
  }, [appliedPreviousPayments, ltcFee, availablePayments]);

  // Check if a payment is applied
  const isPaymentApplied = (paymentTransactionId: string) => {
    return appliedPreviousPayments.some(applied => applied.transaction_id === paymentTransactionId);
  };

  // Deprecated: Use availablePayments memo instead
  const getAvailablePayments = () => {
    console.warn('🚨 [Deprecated] getAvailablePayments() called - use availablePayments memo instead');
    return availablePayments;
  };

  // Fetch student's currently checked out devices
  const fetchCurrentDevices = async () => {
    if (!student.studentId) return;

    setDevicesLoading(true);
    try {
      const response = await fetch(`/api/checkouts/student/${student.studentId}/current-devices`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        const result = await response.json();
        setCurrentDevices(result.devices || []);
      }
    } catch (error) {
      console.error('Error fetching student current devices:', error);
    } finally {
      setDevicesLoading(false);
    }
  };

  // Check if the selected device is available for checkout
  const checkDeviceAvailability = async () => {
    if (!chromebook?.id) return;

    setDeviceStatusLoading(true);
    try {
      // Check device status directly
      const response = await fetch(`/api/chromebooks/${chromebook.id}`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        const deviceData = await response.json();

        // Check if device is pending signature
        if (deviceData.status === 'pending_signature') {
          // Get current assignment details
          let currentAssignment = null;
          if (deviceData.currentUserId) {
            try {
              const studentResponse = await fetch(`/api/students/${deviceData.currentUserId}`, {
                headers: {
                  ...(token && { 'Authorization': `Bearer ${token}` }),
                },
              });
              if (studentResponse.ok) {
                const studentData = await studentResponse.json();
                currentAssignment = {
                  student_id: studentData.studentId,
                  name: `${studentData.firstName} ${studentData.lastName}`,
                  checked_out_date: deviceData.checkedOutDate
                };
              }
            } catch (err) {
              console.error('Error fetching student details:', err);
            }
          }

          setDeviceStatusCheck({
            status: 'pending_signature',
            message: 'This Chromebook has been checked out to a student but is waiting for signatures to be completed. The device cannot be reassigned until the signature process is finished or the checkout is cancelled.',
            currentAssignment: currentAssignment,
            error: 'Chromebook is pending signature completion'
          });
        } else {
          // Device is available
          setDeviceStatusCheck(null);
        }
      } else {
        console.error('Error fetching device details');
        setDeviceStatusCheck(null);
      }
    } catch (error) {
      console.error('Error checking device availability:', error);
      setDeviceStatusCheck(null);
    } finally {
      setDeviceStatusLoading(false);
    }
  };

  // Reset workflow state when component mounts
  useEffect(() => {
    setCurrentStep('review');
    setIsSubmitting(false);
    setIsCompleted(false);
    setShowNotesField(false);
    setOutstandingFees([]);
    setCurrentDevices([]);
    setDeviceStatusCheck(null);
    fetchOutstandingFees();
    fetchLtcFee();
    fetchCurrentDevices();
    checkDeviceAvailability();
    form.reset({
      agreementType: 'standard',
      notes: '',
      insurance: undefined,
    });
  }, [student.id, chromebook.id]);

  const onSubmit = async (data: CheckoutFormValues) => {
    if (!chromebook) return;

    setIsSubmitting(true);
    setShowValidationAnimation(true);
    setValidationError(null);
  };

  // Handle completion of the animated validation sequence
  const handleAnimationComplete = (success: boolean, failedStep?: string) => {
    setShowValidationAnimation(false);
    setIsSubmitting(false);

    if (success) {
      setIsCompleted(true);
      setCurrentStep('confirmation');
      toast({
        title: "Checkout Successful!",
        description: `${chromebook.assetTag} has been checked out to ${student.firstName} ${student.lastName}`,
      });
    } else {
      // Animation failed, check if granular checkout results are available
      console.log(`❌ [Validation] Animation failed at step: ${failedStep}`);

      // PRIORITY: If granular checkout status is available, show that instead of validation results
      // Use a timeout to ensure state has been updated
      setTimeout(() => {
        if (granularCheckoutStatus) {
          console.log('🔄 [Validation] Showing granular checkout results instead of validation results');

          // Brief error toast to indicate failure, but the main UI will show granular steps
          toast({
            title: "Checkout Process Failed",
            description: "See step-by-step results below. You can retry individual failed steps.",
            variant: "destructive"
          });

          // Don't show validation results - granular results are already displayed
          setShowValidationResults(false);
          setValidationFailureStep('none');
          return;
        }

        // Fallback to validation results if no granular status available
        console.log('🔄 [Validation] No granular status available, showing validation results');

        // Set which step failed for detailed error display
        if (failedStep === 'processing-checkout' || failedStep === 'updating-status') {
          setValidationFailureStep(failedStep as 'processing-checkout' | 'updating-status');
        }

        // Show detailed validation results as fallback
        setShowValidationResults(true);

        // Show brief error toast
        toast({
          title: "Validation Failed",
          description: "See validation details below. You can retry specific failed steps.",
          variant: "destructive"
        });
      }, 100);
    }
  };

  const steps = [
    { id: 'review', title: 'Review Selection', icon: CheckCircle },
    ...(deviceStatusCheck?.status === 'pending_signature' ? [{ id: 'device-pending-signature', title: 'Device Unavailable', icon: AlertTriangle }] : []),
    ...(currentDevices.length > 0 ? [{ id: 'device-status-check', title: 'Device Status Check', icon: Search }] : []),
    { id: 'parental-consent', title: 'Parental Consent', icon: User },
    ...(outstandingFees.length > 0 ? [{ id: 'outstanding-fees', title: 'Outstanding Fees', icon: DollarSign }] : []),
    { id: 'details', title: 'Checkout Details', icon: FileText },
    ...(parentPresent && form.watch('insurance') === 'pending' ? [{ id: 'insurance-payment', title: 'Insurance Payment', icon: CreditCard }] : []),
    ...(parentPresent && form.watch('insurancePayment') === 'pay_now' ? [{ id: 'payment-processing', title: 'Payment Processing', icon: DollarSign }] : []),
    { id: 'agreement', title: 'Agreement', icon: FileText },
    { id: 'signature', title: 'Student Signature', icon: FileText },
    ...(parentPresent ? [{ id: 'parent-signature', title: 'Parent Signature', icon: FileText }] : []),
    { id: 'confirmation', title: 'Confirmation', icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = currentStep === step.id;
        const isStepCompleted = index < currentStepIndex || (currentStep === 'confirmation' && isCompleted);
        const isAccessible = index <= currentStepIndex;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isStepCompleted
                    ? "bg-green-500 border-green-500 text-white"
                    : isActive
                    ? "bg-blue-500 border-blue-500 text-white"
                    : isAccessible
                    ? "border-gray-300 text-gray-400 hover:border-blue-300"
                    : "border-gray-200 text-gray-300"
                )}
              >
                <Icon size={16} />
              </div>
              <span
                className={cn(
                  "text-xs mt-2 font-medium",
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                )}
              >
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-4 transition-all",
                  index < currentStepIndex || (currentStep === 'confirmation' && isCompleted)
                    ? "bg-green-500"
                    : "bg-gray-200 dark:bg-gray-700"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Review Your Selection
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Please confirm the student and Chromebook details before proceeding
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-2 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <User className="mr-2 h-5 w-5 text-blue-500" />
              Selected Student
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Name:</span>
              <span className="text-sm font-semibold">{student.firstName} {student.lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Student ID:</span>
              <span className="text-sm font-mono">{student.studentId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Email:</span>
              <span className="text-sm text-blue-600 dark:text-blue-400">{student.email}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <Laptop className="mr-2 h-5 w-5 text-green-500" />
              Selected Chromebook
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Asset Tag:</span>
              <span className="text-sm font-semibold">{chromebook.assetTag}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Serial:</span>
              <span className="text-sm font-mono">{chromebook.serialNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Model:</span>
              <span className="text-sm">{chromebook.model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Available
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => {
            // Check if device is pending signature first
            if (deviceStatusCheck?.status === 'pending_signature') {
              setCurrentStep('device-pending-signature');
            } else if (currentDevices.length > 0) {
              setCurrentStep('device-status-check');
            } else {
              setCurrentStep('parental-consent');
            }
          }}
          className="flex items-center"
        >
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const renderDeviceStatusCheckStep = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Device Status Check
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Checking if this student has any devices currently checked out
        </p>
      </div>

      {devicesLoading ? (
        <div className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : currentDevices.length > 0 ? (
        <>
          <Card className="border-2 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-lg">
                <AlertTriangle className="mr-2 h-5 w-5 text-yellow-600" />
                Student Already Has Device(s) Checked Out
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                This student currently has {currentDevices.length} device(s) checked out. Please review the current assignments below before proceeding with a new checkout.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              Currently Checked Out Devices
            </h4>
            {currentDevices.map((device) => (
              <Card key={device.id} className="border border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Asset Tag:</span>
                        <span className="text-sm font-semibold">{device.assetTag}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Serial:</span>
                        <span className="text-sm font-mono">{device.serialNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Model:</span>
                        <span className="text-sm">{device.model}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                          {device.status === 'checked_out' ? 'Checked Out' : 'Pending Signature'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Checkout Date:</span>
                        <span className="text-sm">{format(new Date(device.checkedOutDate), 'PPP')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Insurance:</span>
                        <Badge variant="outline" className={cn(
                          device.is_insured || device.insurance_status === 'insured' ? 'border-green-500 text-green-700 dark:text-green-400' :
                          (device.insurance_status === 'pending' || device.insuranceStatus === 'pending') ? 'border-yellow-500 text-yellow-700 dark:text-yellow-400' :
                          'border-red-500 text-red-700 dark:text-red-400'
                        )}>
                          {getInsuranceStatusDisplay({
                            isInsured: device.is_insured,
                            insurance_status: device.insurance_status,
                            insuranceStatus: device.insuranceStatus
                          })}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h5 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                    Options for Proceeding
                  </h5>
                  <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                    <li>• You can proceed with checking out an additional device if policy allows</li>
                    <li>• Consider checking in the existing device first if this is a replacement</li>
                    <li>• Contact the student to verify they still have their current device(s)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-lg">
              <CheckCircle className="mr-2 h-5 w-5 text-green-600" />
              No Current Device Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This student does not currently have any devices checked out. You may proceed with the checkout process.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setCurrentStep('review')}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Review</span>
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => setCurrentStep('parental-consent')}
          className="flex items-center space-x-2"
        >
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const renderDevicePendingSignatureStep = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Device Unavailable
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          The selected device cannot be checked out at this time
        </p>
      </div>

      <Card className="border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-lg">
            <AlertTriangle className="mr-2 h-5 w-5 text-red-600" />
            Device Pending Signature Completion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {deviceStatusCheck?.message}
          </p>
        </CardContent>
      </Card>

      {deviceStatusCheck?.currentAssignment && (
        <Card className="border border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Current Assignment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Asset Tag:</span>
                  <span className="text-sm font-semibold">{chromebook.assetTag}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Serial:</span>
                  <span className="text-sm font-mono">{chromebook.serialNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Model:</span>
                  <span className="text-sm">{chromebook.model}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Current Student:</span>
                  <span className="text-sm font-semibold">{deviceStatusCheck.currentAssignment.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Student ID:</span>
                  <span className="text-sm font-mono">{deviceStatusCheck.currentAssignment.student_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Checkout Date:</span>
                  <span className="text-sm">{format(new Date(deviceStatusCheck.currentAssignment.checked_out_date), 'PPP')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    Pending Signature
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
        <CardContent className="pt-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h5 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                Next Steps
              </h5>
              <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                <li>• Complete the signature process for the device (parents can use <a href='https://athena.njesdit.net/mydevice' className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline underline-offset-2" target='_blank'>athena.njesdit.net/mydevice</a> to sign agreements)</li>
                <li>• Choose a different available device for this student</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setCurrentStep('review')}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Review</span>
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => window.location.href = '/checkout'}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700"
        >
          <span>Select Different Device</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const renderDetailsStep = () => (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Checkout Details
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Please provide the required information to complete the checkout
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Insurance Status Card */}
          {parentPresent && (
            <Card className="border-2 border-gray-200 dark:border-gray-700 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-lg font-semibold">
                  <Shield className="mr-3 h-6 w-6 text-blue-500" />
                  Device Insurance Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="insurance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium text-gray-700 dark:text-gray-300">
                        Is this device covered by insurance?
                      </FormLabel>
                      <FormControl>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            className={cn(
                              "h-20 flex flex-col items-center justify-center space-y-2 border-2 transition-all duration-200",
                              field.value === 'uninsured'
                                ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 shadow-md"
                                : "border-gray-300 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/50"
                            )}
                            onClick={() => field.onChange('uninsured')}
                          >
                            <X className="h-6 w-6" />
                            <span className="font-medium">Not Insured</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            className={cn(
                              "h-20 flex flex-col items-center justify-center space-y-2 border-2 transition-all duration-200",
                              field.value === 'pending'
                                ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 shadow-md"
                                : "border-gray-300 hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-950/50"
                            )}
                            onClick={() => field.onChange('pending')}
                          >
                            <ShieldCheck className="h-6 w-6" />
                            <span className="font-medium text-center">Add Insurance<br/><span className="text-xs">${ltcFee} fee required</span></span>
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Notes Section */}
          <Card className="border-2 border-gray-200 dark:border-gray-700 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-between text-lg font-semibold">
                <div className="flex items-center">
                  <FileText className="mr-3 h-6 w-6 text-blue-500" />
                  Additional Notes
                </div>
                {!showNotesField && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNotesField(true)}
                    className="flex items-center space-x-2 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-600 dark:hover:bg-blue-950/50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Notes</span>
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showNotesField ? (
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between mb-3">
                        <FormLabel className="text-base font-medium text-gray-700 dark:text-gray-300">
                          Notes (Optional)
                        </FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowNotesField(false);
                            field.onChange('');
                          }}
                          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder="Add any relevant notes about this checkout (e.g., device condition, special instructions, etc.)"
                          className="min-h-[100px] resize-none border-2 focus:border-blue-500 transition-colors"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Click "Add Notes" to include additional information about this checkout
                </p>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-between pt-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setCurrentStep('parental-consent')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={() => {
                const insuranceChoice = form.watch('insurance');
                if (parentPresent && insuranceChoice === 'pending') {
                  setCurrentStep('insurance-payment');
                } else {
                  setCurrentStep('agreement');
                }
              }}
              disabled={parentPresent && form.watch('insurance') === undefined}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );

  const renderParentalConsentStep = () => (
    <div className="max-w-2xl mx-auto space-y-8 text-center">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            Parent or Guardian Consent
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
            Is a parent or legal guardian present to sign the agreement?
        </p>
        <div className="flex justify-center space-x-4">
            <Button
                type="button"
                size="lg"
                onClick={() => {
                    setParentPresent(true);
                    const nextStep = outstandingFees.length > 0 ? 'outstanding-fees' : 'details';
                    setCurrentStep(nextStep);
                }}
            >
                Yes, Parent is Present
            </Button>
            <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                    setParentPresent(false);
                    const nextStep = outstandingFees.length > 0 ? 'outstanding-fees' : 'details';
                    setCurrentStep(nextStep);
                }}
            >
                No, Parent is Not Present
            </Button>
        </div>
        <div className="flex justify-between pt-6">
            <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setCurrentStep('review')}
                className="flex items-center space-x-2"
            >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Review</span>
            </Button>
        </div>
    </div>
  );

  const renderOutstandingFeesStep = () => {
    const handleAddPayment = async (feeId: number, amount: number, paymentMethod: string, notes: string) => {
      try {
        const response = await fetch(`/api/fees/${feeId}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
          body: JSON.stringify({ amount, payment_method: paymentMethod, notes }),
        });

        if (!response.ok) {
          throw new Error('Failed to add payment');
        }

        toast({
          title: 'Success',
          description: 'Payment added successfully.',
        });

        // Refresh outstanding fees
        await fetchOutstandingFees();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to add payment.',
          variant: 'destructive',
        });
      }
    };

    const totalOutstanding = outstandingFees.reduce((sum, fee) => sum + (Number(fee.balance) || 0), 0);

    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            Outstanding Fees
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            This student has outstanding fees that should be addressed before checkout.
          </p>
        </div>

        {feesLoading ? (
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            <Card className="border-2 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-lg">
                  <AlertTriangle className="mr-2 h-5 w-5 text-yellow-600" />
                  Fee Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg font-medium">Total Outstanding Balance:</span>
                  <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                    ${Number(totalOutstanding).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  You may proceed with checkout, but consider collecting payment or setting up a payment plan.
                </p>
                <div className="flex justify-center">
                  {outstandingFees.length > 0 && (
                    <AddPaymentDialog
                      fee={outstandingFees[0]}
                      onAddPayment={handleAddPayment}
                      onRefresh={fetchOutstandingFees}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Outstanding Fees Details
              </h4>
              {outstandingFees.map((fee) => (
                <Card key={fee.id} className="border border-gray-200 dark:border-gray-700">
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {fee.description}
                          </span>
                          <span className="text-lg font-semibold text-red-600 dark:text-red-400">
                            ${Number(fee.balance || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <p>Created: {format(new Date(fee.created_at!), 'PPP')}</p>
                          <p>Original Amount: ${Number(fee.amount).toFixed(2)}</p>
                          {fee.payments && fee.payments.length > 0 && (
                            <p>
                              Payments Made: $
                              {fee.payments.reduce((sum, payment) => sum + Number(payment.amount), 0).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-between pt-6">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setCurrentStep('parental-consent')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => setCurrentStep('details')}
            className="flex items-center space-x-2"
          >
            <span>Continue to Checkout</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

      </div>
    );
  };

  const renderInsurancePaymentStep = () => (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Insurance Payment
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Complete the insurance payment to protect the device
        </p>
      </div>

      <Card className="border-2 border-blue-200 dark:border-blue-800 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center text-lg font-semibold">
            <CreditCard className="mr-3 h-6 w-6 text-blue-500" />
            Device Insurance Fee
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-medium text-gray-700 dark:text-gray-300">Insurance Fee:</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">${ltcFee}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This fee provides coverage for accidental damage to the device. <br />The device will be marked as 'pending' until payment is completed.
            </p>
          </div>

          <Form {...form}>
            <FormField
              control={form.control}
              name="insurancePayment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium text-gray-700 dark:text-gray-300">
                    Payment Method
                  </FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-1 gap-4 mt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className={cn(
                          "h-16 flex items-center justify-between px-6 border-2 transition-all duration-200",
                          field.value === 'pay_now'
                            ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 shadow-md"
                            : "border-gray-300 hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-950/50"
                        )}
                        onClick={() => field.onChange('pay_now')}
                      >
                        <div className="flex items-center space-x-3">
                          <CreditCard className="h-5 w-5" />
                          <span className="font-medium">Pay Now</span>
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Cash or Check</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className={cn(
                          "h-16 flex items-center justify-between px-6 border-2 transition-all duration-200",
                          field.value === 'pay_later'
                            ? "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 shadow-md"
                            : "border-gray-300 hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-950/50"
                        )}
                        onClick={() => field.onChange('pay_later')}
                      >
                        <div className="flex items-center space-x-3">
                          <AlertTriangle className="h-5 w-5" />
                          <span className="font-medium">Pay Later</span>
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Adds a ${ltcFee} outstanding fee to account balance</span>
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>

          {form.watch('insurancePayment') === 'pay_now' && (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-700 dark:text-green-300">Payment Confirmed</span>
              </div>
              <p className="text-sm text-green-600 dark:text-green-400">
                Device will be marked as 'insured' and fully protected against accidental damage.
              </p>
            </div>
          )}

          {form.watch('insurancePayment') === 'pay_later' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <span className="font-medium text-yellow-700 dark:text-yellow-300">Payment Pending</span>
              </div>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Device will be marked as 'pending insurance'. <br />
                Parents will have 5 days to pay the outstanding fee. <br />
                Payments can be processed at any time under the student's account in the <a href="https://athena.njesdit.net/users" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline underline-offset-2" target="_blank" rel="noopener noreferrer">users</a> page.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setCurrentStep('details')}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => {
            const paymentChoice = form.watch('insurancePayment');
            if (paymentChoice === 'pay_now') {
              // Initialize payment details with default values
              setPaymentDetails({
                paymentMethod: 'Cash',
                amount: ltcFee,
                notes: ''
              });
              // Fetch previous payments when entering payment processing
              console.log(`📞 [Frontend] Calling fetchPreviousPayments for student ID: ${student.id}`);
              fetchPreviousPayments();
              setCurrentStep('payment-processing');
            } else {
              // For 'pay_later', keep insurance as 'pending' and go to agreement
              setCurrentStep('agreement');
            }
          }}
          disabled={!form.watch('insurancePayment')}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const renderPaymentProcessingStep = () => (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Payment Processing
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Enter payment details for the insurance fee
        </p>
      </div>

      <Card className="border-2 border-green-200 dark:border-green-800 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center text-lg font-semibold">
            <DollarSign className="mr-3 h-6 w-6 text-green-500" />
            Insurance Payment Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-lg font-medium text-gray-700 dark:text-gray-300">Insurance Fee:</span>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">${ltcFee}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Processing payment for device insurance coverage
            </p>
          </div>

          <div className="space-y-4">
            {/* Payment Method */}
            <div className="space-y-2">
              <label className="text-base font-medium text-gray-700 dark:text-gray-300">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className={cn(
                    "h-16 flex flex-col items-center justify-center space-y-2 border-2 transition-all duration-200",
                    paymentDetails.paymentMethod === 'Cash'
                      ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 shadow-md"
                      : "border-gray-300 hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-950/50"
                  )}
                  onClick={() => setPaymentDetails({ ...paymentDetails, paymentMethod: 'Cash' })}
                >
                  <DollarSign className="h-6 w-6" />
                  <span className="font-medium">Cash</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className={cn(
                    "h-16 flex flex-col items-center justify-center space-y-2 border-2 transition-all duration-200",
                    paymentDetails.paymentMethod === 'Check'
                      ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 shadow-md"
                      : "border-gray-300 hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-950/50"
                  )}
                  onClick={() => setPaymentDetails({ ...paymentDetails, paymentMethod: 'Check' })}
                >
                  <FileText className="h-6 w-6" />
                  <span className="font-medium">Check</span>
                </Button>
              </div>
            </div>

            {/* Previous Payments Section */}
            {loadingPreviousPayments ? (
              <div className="space-y-2">
                <label className="text-base font-medium text-gray-700 dark:text-gray-300">
                  Checking for Previous Payments
                </label>
                <div className="flex items-center justify-center h-16 border-2 border-gray-200 dark:border-gray-700 rounded-lg">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Loading previous payments...</span>
                </div>
              </div>
            ) : previousPayments.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-base font-medium text-gray-700 dark:text-gray-300">
                    Available Previous Payments
                  </label>
                  {availablePayments.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyAllPreviousPayments}
                      className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-600 dark:hover:bg-blue-950/50"
                    >
                      Apply All Available Credits
                    </Button>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center space-x-2 mb-3">
                    <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h4 className="font-medium text-blue-900 dark:text-blue-300">Device Insurance Credit Transfer</h4>
                  </div>
                  <p className="text-sm text-blue-800 dark:text-blue-400 mb-4">
                    This student has insurance credits available from previous device assignments. Choose how to handle these credits:
                  </p>

                  <div className="bg-white dark:bg-gray-800 p-3 rounded border mb-4">
                    <h5 className="font-medium text-blue-900 dark:text-blue-300 mb-2 flex items-center">
                      <CreditCard className="h-4 w-4 mr-2" />
                      Credit Transfer Options
                    </h5>
                    <div className="space-y-2 text-sm text-blue-800 dark:text-blue-400">
                      <div className="flex items-start space-x-2">
                        <span className="font-medium">•</span>
                        <div>
                          <span className="font-medium">Apply Credits:</span> Transfer insurance payments from the previous device (retains original transaction)
                        </div>
                      </div>
                      <div className="flex items-start space-x-2">
                        <span className="font-medium">•</span>
                        <div>
                          <span className="font-medium">New Payment:</span> Make a new payment (invalidates all unused credits)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Available Payments */}
                  {availablePayments.length > 0 && (
                    <div className="space-y-3 mb-4">
                      <h5 className="text-sm font-medium text-blue-900 dark:text-blue-300">Available Credits</h5>
                      {availablePayments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded border">
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-sm">${Number(payment.amount).toFixed(2)} - {payment.payment_method}</span>
                                {payment.original_asset_tag && (
                                  <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-600">
                                    From Device: {payment.original_asset_tag}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {format(new Date(payment.created_at), 'PPP')}
                              </span>
                            </div>
                            {payment.original_asset_tag && (
                              <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">
                                Credit from previous payment on device {payment.original_asset_tag}
                              </p>
                            )}
                            {payment.notes && (
                              <p className="text-xs text-gray-600 dark:text-gray-400">{payment.notes}</p>
                            )}
                            {payment.transaction_id && (
                              <p className="text-xs text-gray-500 dark:text-gray-500">Transaction ID: {payment.transaction_id}</p>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => applyPreviousPayment(payment)}
                            className="ml-3 bg-blue-600 hover:bg-blue-700"
                          >
                            Apply Credit
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Applied Payments */}
                  {appliedPreviousPayments.length > 0 && (
                    <div className="space-y-3 mb-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-medium text-green-800 dark:text-green-300">Applied Credits</h5>
                        <span className="font-bold text-green-800 dark:text-green-300">
                          -${appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}
                        </span>
                      </div>
                      {appliedPreviousPayments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between bg-green-100 dark:bg-green-900/40 p-3 rounded border border-green-300 dark:border-green-600">
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-sm text-green-800 dark:text-green-200">${Number(payment.amount).toFixed(2)} - {payment.payment_method}</span>
                                {payment.original_asset_tag && (
                                  <Badge variant="outline" className="text-xs bg-green-200 text-green-800 border-green-400 dark:bg-green-800 dark:text-green-200 dark:border-green-500">
                                    From: {payment.original_asset_tag}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-green-600 dark:text-green-400">Applied</span>
                            </div>
                            {payment.original_asset_tag && (
                              <p className="text-xs text-green-700 dark:text-green-300 mb-1">
                                Original transaction ID {payment.transaction_id} will be preserved from device {payment.original_asset_tag}
                              </p>
                            )}
                            {payment.notes && (
                              <p className="text-xs text-green-700 dark:text-green-300">{payment.notes}</p>
                            )}
                            {payment.transaction_id && (
                              <p className="text-xs text-green-600 dark:text-green-400">Transaction ID: {payment.transaction_id}</p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeAppliedPayment(payment.transaction_id)}
                            className="ml-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-950/50"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {availablePayments.length === 0 && appliedPreviousPayments.length > 0 && (
                    <div className="text-center py-2">
                      <span className="text-sm text-green-600 dark:text-green-400 font-medium">All available credits have been applied</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Amount */}
            <div className="space-y-2">
              <label className="text-base font-medium text-gray-700 dark:text-gray-300">
                {appliedPreviousPayments.length > 0 ? 'Additional Payment Amount' : 'Payment Amount'}
              </label>
            <Input
              type="number"
              value={paymentDetails.amount === 0 ? '' : paymentDetails.amount}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  setPaymentDetails({
                    ...paymentDetails,
                    amount: 0
                  });
                } else {
                  const parsed = parseFloat(value);
                  setPaymentDetails({
                    ...paymentDetails,
                    amount: isNaN(parsed) ? 0 : parsed
                  });
                }
              }}
              min="0"
              max={ltcFee - appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0)}
              step="0.01"
              className="text-lg h-12 border-2 focus:border-green-500 transition-colors"
              placeholder="0.00"
            />
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Minimum: $0.00</span>
                <span>Maximum: ${(ltcFee - appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0)).toFixed(2)}</span>
              </div>
              {appliedPreviousPayments.length > 0 && (
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  ${appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)} will be applied from previous payments
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-base font-medium text-gray-700 dark:text-gray-300">
                Notes (Optional)
              </label>
              <Input
                type="text"
                value={paymentDetails.notes}
                onChange={(e) => setPaymentDetails({ ...paymentDetails, notes: e.target.value })}
                className="h-12 border-2 focus:border-green-500 transition-colors"
                placeholder={paymentDetails.paymentMethod === 'Check' ? 'Check number, memo, etc.' : 'Payment details, reference, etc.'}
              />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {paymentDetails.paymentMethod === 'Check'
                  ? 'Enter check number, memo, or other relevant details'
                  : 'Enter any additional payment information'}
              </p>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Payment Summary</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Payment Method:</span>
                <span className="text-sm font-medium">{paymentDetails.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Amount:</span>
                <span className="text-sm font-medium">${paymentDetails.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Remaining Balance:</span>
                <span className="text-sm font-medium">${(ltcFee - paymentDetails.amount).toFixed(2)}</span>
              </div>
              {paymentDetails.notes && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Notes:</span>
                  <span className="text-sm font-medium">{paymentDetails.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Status */}
          {(() => {
            const totalAppliedFromPrevious = appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const totalPayment = paymentDetails.amount + totalAppliedFromPrevious;
            const remainingBalance = ltcFee - totalPayment;

            if (totalPayment >= ltcFee) {
              return (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center space-x-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-green-700 dark:text-green-300">Full Payment</span>
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Device will be marked as 'insured' and fully protected against accidental damage.
                  </p>
                  {totalAppliedFromPrevious > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      ${totalAppliedFromPrevious.toFixed(2)} applied from previous payments{paymentDetails.amount > 0 ? ` + $${paymentDetails.amount.toFixed(2)} new payment` : ''}
                    </p>
                  )}
                </div>
              );
            } else if (totalPayment > 0) {
              return (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    <span className="font-medium text-yellow-700 dark:text-yellow-300">Partial Payment</span>
                  </div>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Remaining balance of ${remainingBalance.toFixed(2)} will be added to student's account.
                  </p>
                  {totalAppliedFromPrevious > 0 && (
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                      ${totalAppliedFromPrevious.toFixed(2)} applied from previous payments{paymentDetails.amount > 0 ? ` + $${paymentDetails.amount.toFixed(2)} new payment` : ''}
                    </p>
                  )}
                </div>
              );
            } else {
              return (
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center space-x-2 mb-2">
                    <X className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <span className="font-medium text-red-700 dark:text-red-300">No Payment</span>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Please enter a payment amount greater than $0.00 or apply available credits.
                  </p>
                </div>
              );
            }
          })()}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setCurrentStep('insurance-payment')}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => {
            // Calculate total payment including applied credits
            const totalAppliedFromPrevious = appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const totalPayment = paymentDetails.amount + totalAppliedFromPrevious;

            // Set insurance status based on total payment amount
            if (totalPayment >= ltcFee) {
              form.setValue('insurance', 'insured');
            } else {
              form.setValue('insurance', 'pending');
            }
            setCurrentStep('agreement');
          }}
          disabled={(() => {
            const totalAppliedFromPrevious = appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const totalPayment = paymentDetails.amount + totalAppliedFromPrevious;
            return totalPayment <= 0;
          })()}
          className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:opacity-50"
        >
          <span>Continue to Agreement</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const renderAgreementStep = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Checkout Agreement
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Please read the agreement below before signing.
        </p>
      </div>
      <AgreementPreview
        onAgree={() => setCurrentStep('signature')}
        insuranceStatus={form.watch('insurance') as 'pending' | 'insured' | 'uninsured' | 'waived'}
      />
      <div className="flex justify-between pt-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                const hasInsurancePayment = parentPresent && form.watch('insurance') === 'pending';
                const prevStep = hasInsurancePayment ? 'insurance-payment' :
                  outstandingFees.length > 0 ? 'outstanding-fees' : 'details';
                setCurrentStep(prevStep);
              }}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
      </div>
    </div>
  );

  const renderSignatureStep = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Student Signature
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Please have the student sign in the box below to confirm receipt of the device.
        </p>
      </div>

      {/* Show animated validation sequence */}
      {showValidationAnimation && (
        <CheckoutValidationAnimation
          steps={validationSteps}
          onValidationStep={handleValidationStep}
          onComplete={handleAnimationComplete}
        />
      )}

      {/* Show granular checkout step results prominently when available */}
      {granularCheckoutStatus && (
        <div className="mb-8">
          <GranularCheckoutStepResults
            checkoutStatus={granularCheckoutStatus}
            validationError={validationError}
            onRetryStep={handleRetryGranularStep}
            onRetryAll={handleRetryAllGranularSteps}
            onForceComplete={() => {
              setGranularCheckoutStatus(null);
              setShowGranularCheckoutResults(false);
              setIsCompleted(true);
              setCurrentStep('confirmation');
              toast({
                title: "Checkout Force Completed",
                description: "Checkout was completed despite granular step failures. Please verify the results manually.",
                variant: "destructive"
              });
            }}
            isProcessing={isSubmitting}
            title="Checkout Process Steps"
          />
        </div>
      )}

      {/* Show detailed validation results when validation fails */}
      {showValidationResults && (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">
              Validation Failed
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              The checkout process encountered errors. Review the details below and retry specific failed steps.
            </p>
          </div>

          {/* Pre-flight validation results */}
          {preFlightResults && (
            <ValidationResults
              preFlightResults={preFlightResults}
              isValidating={isValidating && validationStep === 'pre-flight'}
              onRetry={handleRetryValidation}
              onProceed={() => {
                if (preFlightResults?.overall) {
                  setShowValidationResults(false);
                  handleClearValidation();
                }
              }}
              showActions={true}
              title="Pre-Flight Validation Results"
            />
          )}

          {/* Post-flight validation results */}
          {postFlightResults && (
            <ValidationResults
              postFlightResults={postFlightResults}
              isValidating={isValidating && validationStep === 'post-flight'}
              onRetry={async () => {
                if (checkoutId) {
                  const expectedStatus = parentPresent ? 'checked_out' : 'pending_signature';
                  await runPostFlightValidation(checkoutId, expectedStatus);
                }
              }}
              onProceed={() => {
                if (postFlightResults?.overall) {
                  setShowValidationResults(false);
                  setIsCompleted(true);
                  setCurrentStep('confirmation');
                }
              }}
              showActions={true}
              title="Post-Flight Validation Results"
            />
          )}

          {/* Failed step details */}
          {validationFailureStep !== 'none' && validationError && (
            <Card className="border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <CardHeader>
                <CardTitle className="flex items-center text-lg text-red-600 dark:text-red-400">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  Step Failure Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="font-medium">Failed Step:</span>
                    <span className="capitalize">{validationFailureStep.replace('-', ' ')}</span>
                  </div>
                  <div className="space-y-2">
                    <span className="font-medium">Error Details:</span>
                    <div className="bg-white dark:bg-gray-800 p-3 rounded border text-sm whitespace-pre-wrap">
                      {validationError}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          <div className="flex justify-between pt-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                setShowValidationResults(false);
                setValidationFailureStep('none');
                setValidationError(null);
                handleClearValidation();
                // Go back to appropriate signature step
                if (parentPresent && currentStep === 'parent-signature') {
                  setCurrentStep('parent-signature');
                } else {
                  setCurrentStep('signature');
                }
              }}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Signatures</span>
            </Button>

            <div className="flex space-x-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  // Retry the validation process from the beginning
                  setShowValidationResults(false);
                  setValidationFailureStep('none');
                  setValidationError(null);
                  handleClearValidation();
                  setShowValidationAnimation(true);
                  setIsSubmitting(true);
                }}
                className="flex items-center space-x-2"
              >
                <Loader2 className="h-4 w-4" />
                <span>Retry Validation</span>
              </Button>

              {/* Show "Force Complete" only if user has admin role or in development */}
              <Button
                type="button"
                size="lg"
                onClick={() => {
                  // Force completion - should only be available to admins
                  setShowValidationResults(false);
                  setIsCompleted(true);
                  setCurrentStep('confirmation');
                  toast({
                    title: "Checkout Force Completed",
                    description: "Checkout was completed despite validation failures. Please verify the results manually.",
                    variant: "destructive"
                  });
                }}
                className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Force Complete</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Show validation results if pre-flight validation failed */}
      {!showValidationAnimation && !showValidationResults && preFlightResults && !preFlightResults.overall && (
        <div className="mb-8">
          <ValidationResults
            preFlightResults={preFlightResults}
            isValidating={isValidating && validationStep === 'pre-flight'}
            onRetry={handleRetryValidation}
            onProceed={() => {
              // Only allow proceed if validation passes
              if (preFlightResults?.overall) {
                handleClearValidation();
              }
            }}
            showActions={true}
            title="Pre-Flight Validation Results"
          />
        </div>
      )}

      {!showValidationAnimation && (
        <>
          <div className="max-w-2xl mx-auto">
            <div className="border-2 border-gray-300 dark:border-gray-600 rounded-xl p-4 shadow-inner bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-lg font-medium text-gray-800 dark:text-gray-200">
                  Student Agreement
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearStudentSignature}
                  disabled={!hasStudentSignature}
                  className="flex items-center space-x-1 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-950/50 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  <span>Clear</span>
                </Button>
              </div>
              <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <SignatureCapture
                  ref={studentSignaturePadRef}
                  onChange={handleStudentSignatureChange}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-6 max-w-2xl mx-auto">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                handleClearValidation();
                setCurrentStep('agreement');
              }}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Agreement</span>
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={!hasStudentSignature || isSubmitting || (preFlightResults && !preFlightResults.overall)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              onClick={() => {
                const signature = studentSignaturePadRef.current?.getSignature();
                if (signature) {
                  form.setValue('signature', signature);
                  if (parentPresent) {
                    setCurrentStep('parent-signature');
                  } else {
                    form.handleSubmit(onSubmit)();
                  }
                } else {
                  toast({
                    title: 'Signature Required',
                    description: 'Please provide a signature.',
                    variant: 'destructive',
                  });
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>{parentPresent ? 'Next' : 'Complete Checkout'}</span>
                  <CheckCircle className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const renderParentSignatureStep = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Parent/Guardian Signature
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Please have the parent or guardian sign in the box below to acknowledge the agreement.
        </p>
      </div>

      {/* Show animated validation sequence */}
      {showValidationAnimation && (
        <CheckoutValidationAnimation
          steps={validationSteps}
          onValidationStep={handleValidationStep}
          onComplete={handleAnimationComplete}
        />
      )}

      {/* Show detailed validation results when validation fails */}
      {showValidationResults && (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">
              Validation Failed
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              The checkout process encountered errors. Review the details below and retry specific failed steps.
            </p>
          </div>

          {/* Pre-flight validation results */}
          {preFlightResults && (
            <ValidationResults
              preFlightResults={preFlightResults}
              isValidating={isValidating && validationStep === 'pre-flight'}
              onRetry={handleRetryValidation}
              onProceed={() => {
                if (preFlightResults?.overall) {
                  setShowValidationResults(false);
                  handleClearValidation();
                }
              }}
              showActions={true}
              title="Pre-Flight Validation Results"
            />
          )}

          {/* Post-flight validation results */}
          {postFlightResults && (
            <ValidationResults
              postFlightResults={postFlightResults}
              isValidating={isValidating && validationStep === 'post-flight'}
              onRetry={async () => {
                if (checkoutId) {
                  const expectedStatus = parentPresent ? 'checked_out' : 'pending_signature';
                  await runPostFlightValidation(checkoutId, expectedStatus);
                }
              }}
              onProceed={() => {
                if (postFlightResults?.overall) {
                  setShowValidationResults(false);
                  setIsCompleted(true);
                  setCurrentStep('confirmation');
                }
              }}
              showActions={true}
              title="Post-Flight Validation Results"
            />
          )}

          {/* Failed step details */}
          {validationFailureStep !== 'none' && validationError && (
            <Card className="border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <CardHeader>
                <CardTitle className="flex items-center text-lg text-red-600 dark:text-red-400">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  Step Failure Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="font-medium">Failed Step:</span>
                    <span className="capitalize">{validationFailureStep.replace('-', ' ')}</span>
                  </div>
                  <div className="space-y-2">
                    <span className="font-medium">Error Details:</span>
                    <div className="bg-white dark:bg-gray-800 p-3 rounded border text-sm whitespace-pre-wrap">
                      {validationError}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          <div className="flex justify-between pt-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                setShowValidationResults(false);
                setValidationFailureStep('none');
                setValidationError(null);
                handleClearValidation();
                // Go back to appropriate signature step
                setCurrentStep('parent-signature');
              }}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Parent Signature</span>
            </Button>

            <div className="flex space-x-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  // Retry the validation process from the beginning
                  setShowValidationResults(false);
                  setValidationFailureStep('none');
                  setValidationError(null);
                  handleClearValidation();
                  setShowValidationAnimation(true);
                  setIsSubmitting(true);
                }}
                className="flex items-center space-x-2"
              >
                <Loader2 className="h-4 w-4" />
                <span>Retry Validation</span>
              </Button>

              {/* Show "Force Complete" only if user has admin role or in development */}
              <Button
                type="button"
                size="lg"
                onClick={() => {
                  // Force completion - should only be available to admins
                  setShowValidationResults(false);
                  setIsCompleted(true);
                  setCurrentStep('confirmation');
                  toast({
                    title: "Checkout Force Completed",
                    description: "Checkout was completed despite validation failures. Please verify the results manually.",
                    variant: "destructive"
                  });
                }}
                className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Force Complete</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Show validation results if pre-flight validation failed */}
      {!showValidationAnimation && !showValidationResults && preFlightResults && !preFlightResults.overall && (
        <div className="mb-8">
          <ValidationResults
            preFlightResults={preFlightResults}
            isValidating={isValidating && validationStep === 'pre-flight'}
            onRetry={handleRetryValidation}
            onProceed={() => {
              // Only allow proceed if validation passes
              if (preFlightResults?.overall) {
                handleClearValidation();
              }
            }}
            showActions={true}
            title="Pre-Flight Validation Results"
          />
        </div>
      )}

      {!showValidationAnimation && !showValidationResults && (
        <>
          <div className="max-w-2xl mx-auto">
            <div className="border-2 border-gray-300 dark:border-gray-600 rounded-xl p-4 shadow-inner bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-lg font-medium text-gray-800 dark:text-gray-200">
                  Parent/Guardian Agreement
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearParentSignature}
                  disabled={!hasParentSignature}
                  className="flex items-center space-x-1 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-950/50 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  <span>Clear</span>
                </Button>
              </div>
              <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <SignatureCapture
                  ref={parentSignaturePadRef}
                  onChange={handleParentSignatureChange}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-6 max-w-2xl mx-auto">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                handleClearValidation();
                setCurrentStep('signature');
              }}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Student Signature</span>
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={!hasParentSignature || isSubmitting || (preFlightResults && !preFlightResults.overall)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              onClick={() => {
                const parentSignature = parentSignaturePadRef.current?.getSignature();
                if (parentSignature) {
                  form.setValue('parentSignature', parentSignature);
                  form.handleSubmit(onSubmit)();
                } else {
                  toast({
                    title: 'Signature Required',
                    description: 'Please provide a signature.',
                    variant: 'destructive',
                  });
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Complete Checkout</span>
                  <CheckCircle className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const renderConfirmationStep = () => {
    const handlePrint = () => {
      if (checkoutId) {
        const url = `/api/checkouts/${checkoutId}/agreement?token=${token}`;
        window.open(url, '_blank');
      } else {
        toast({
          title: "Error",
          description: "Could not retrieve checkout ID for printing.",
          variant: "destructive",
        });
      }
    };

  const handlePrintReceipt = async () => {
    try {
      // Calculate remaining insurance fee based on payment
      let remainingInsuranceFee = ltcFee;
      let actualPaymentMethod = undefined;
      let actualPaymentAmount = undefined;
      let actualPaymentNotes = undefined;
      let transactionId = undefined;

      // Prepare applied credits information for receipt
      const appliedCreditsInfo = appliedPreviousPayments.map(payment => ({
        transaction_id: payment.transaction_id,
        amount: Number(payment.amount),
        payment_method: payment.payment_method,
        original_asset_tag: payment.original_asset_tag,
        notes: payment.notes
      }));

      // Only include payment details if payment was actually made during checkout
      if (form.watch('insurancePayment') === 'pay_now' && paymentDetails.amount > 0) {
        const totalAppliedFromPrevious = appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        remainingInsuranceFee = ltcFee - paymentDetails.amount - totalAppliedFromPrevious;
        actualPaymentMethod = paymentDetails.paymentMethod;
        actualPaymentAmount = paymentDetails.amount;
        actualPaymentNotes = paymentDetails.notes;

        // Get transaction ID from granular checkout status if available
        if (granularCheckoutStatus && granularCheckoutStatus.paymentTransactionId) {
          transactionId = granularCheckoutStatus.paymentTransactionId;
        }
      } else if (appliedPreviousPayments.length > 0) {
        // If only credits were applied (no new payment)
        const totalAppliedFromPrevious = appliedPreviousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        remainingInsuranceFee = ltcFee - totalAppliedFromPrevious;
      }

      const receiptData = {
        student: {
          name: `${student.firstName} ${student.lastName}`,
          studentId: student.studentId,
        },
        chromebook: {
          assetTag: chromebook.assetTag,
          serialNumber: chromebook.serialNumber,
          model: chromebook.model,
        },
        checkoutDate: new Date().toISOString(),
        insuranceStatus: form.watch('insurance') || 'uninsured',
        paymentMethod: actualPaymentMethod,
        insuranceFee: remainingInsuranceFee,
        paymentAmount: actualPaymentAmount,
        paymentNotes: actualPaymentNotes,
        transactionId: transactionId,
        appliedCredits: appliedCreditsInfo, // Include applied credits information
        notes: form.watch('notes'),
      };

        const response = await fetch('/api/receipts/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
          body: JSON.stringify(receiptData),
        });

        if (!response.ok) {
          throw new Error('Failed to generate receipt');
        }

        // Download the PDF
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `checkout_receipt_${chromebook.assetTag}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: 'Success',
          description: 'Checkout receipt downloaded successfully.',
        });
      } catch (error) {
        console.error('Error generating receipt:', error);
        toast({
          title: 'Error',
          description: 'Failed to generate receipt.',
          variant: 'destructive',
        });
      }
    };

    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Checkout Complete!
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            The Chromebook has been successfully checked out to the student.
          </p>
        </div>

        <Card className="bg-gray-50 dark:bg-gray-800 border-0">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-medium">Student:</span>
                <span>{student.firstName} {student.lastName}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-medium">Chromebook:</span>
                <span>{chromebook.assetTag}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-medium">Checkout Date:</span>
                <span>{format(new Date(), 'PPP')}</span>
              </div>
              {parentPresent && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Insurance Status:</span>
                    <span className={cn(
                      "font-medium",
                      form.watch('insurance') === 'insured' ? "text-green-600 dark:text-green-400" :
                      form.watch('insurance') === 'pending' ? "text-yellow-600 dark:text-yellow-400" :
                      "text-red-600 dark:text-red-400"
                    )}>
                      {form.watch('insurance') === 'insured' ? 'Insured (Paid)' :
                       form.watch('insurance') === 'pending' ? 'Pending Payment' : 'Not Insured'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center space-x-4">
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Start New Checkout
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!checkoutId}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print Agreement
          </Button>
          {parentPresent && (
            <Button
              variant="outline"
              onClick={handlePrintReceipt}
              className="flex items-center space-x-2"
            >
              <Printer className="h-4 w-4" />
              <span>Print Receipt</span>
            </Button>
          )}
          <Button
            onClick={() => window.location.href = '/'}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {renderStepIndicator()}

      {currentStep === 'review' && renderReviewStep()}
      {currentStep === 'device-pending-signature' && renderDevicePendingSignatureStep()}
      {currentStep === 'device-status-check' && renderDeviceStatusCheckStep()}
      {currentStep === 'parental-consent' && renderParentalConsentStep()}
      {currentStep === 'outstanding-fees' && renderOutstandingFeesStep()}
      {currentStep === 'details' && renderDetailsStep()}
      {currentStep === 'insurance-payment' && renderInsurancePaymentStep()}
      {currentStep === 'payment-processing' && renderPaymentProcessingStep()}
      {currentStep === 'agreement' && renderAgreementStep()}
      {currentStep === 'signature' && renderSignatureStep()}
      {currentStep === 'parent-signature' && renderParentSignatureStep()}
      {currentStep === 'confirmation' && renderConfirmationStep()}
    </div>
  );
};
