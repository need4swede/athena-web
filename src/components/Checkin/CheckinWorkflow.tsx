import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle, User, Laptop, FileText, ArrowRight, ArrowLeft, Loader2, AlertTriangle, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/components/sso/SSOProvider';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Chromebook } from '@/types/chromebook';
import { getInsuranceStatusDisplay } from '@/lib/insurance-utils';

// Import step components (we'll create these next)
import { DeviceVerification } from './DeviceVerification';
import { ServiceTypeSelection } from './ServiceTypeSelection';
import { DeviceInService } from './DeviceInService';
import { DamageAssessment } from './DamageAssessment';
import { ProcessingDetails } from './ProcessingDetails';
import { CheckinConfirmation } from './CheckinConfirmation';
import { AddPaymentDialog } from '../Users/StudentFees';
import { StudentFee } from '@/types/fees';

export interface DamageLocation {
  id: string;
  x: number;
  y: number;
  area: string;
  damageType: string;
  severity: 'minor' | 'major' | 'critical';
  description?: string;
  photos?: File[];
}

export interface RepairRecommendation {
  item: string;
  cost: number;
  priority: 'low' | 'medium' | 'high';
  description: string;
}

const checkinFormSchema = z.object({
  condition: z.enum(['good', 'damaged', 'requires_repair']),
  chargerReturned: z.boolean().optional(),
  waiveCost: z.boolean().optional(),
  damageLocations: z.array(z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    area: z.string(),
    damageType: z.string(),
    severity: z.enum(['minor', 'major', 'critical']),
    description: z.string().optional(),
  })).optional(),
  photos: z.array(z.any()).optional(),
  repairRecommendations: z.array(z.object({
    item: z.string(),
    cost: z.number(),
    priority: z.enum(['low', 'medium', 'high']),
    description: z.string(),
  })).optional(),
  totalCost: z.number().optional(),
  notes: z.string().optional(),
  specialInstructions: z.string().optional(),
});

type CheckinFormValues = z.infer<typeof checkinFormSchema>;

interface CheckinWorkflowProps {
  chromebook: Chromebook;
  onComplete?: (data: CheckinFormValues) => void;
  isModal?: boolean;
}

type WorkflowStep = 'verification' | 'service_type' | 'assessment' | 'processing' | 'payment' | 'confirmation';

// Utility function to convert File to base64
const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};


// Payment Step Component
interface PaymentStepProps {
  chromebook: Chromebook;
  totalCost: number;
  paymentAmount: number;
  setPaymentAmount: (amount: number) => void;
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
  paymentNotes: string;
  setPaymentNotes: (notes: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
  onPrevious: () => void;
}

const PaymentStep: React.FC<PaymentStepProps> = ({
  chromebook,
  totalCost,
  paymentAmount,
  setPaymentAmount,
  paymentMethod,
  setPaymentMethod,
  paymentNotes,
  setPaymentNotes,
  isSubmitting,
  onSubmit,
  onPrevious,
}) => {
  const studentName = chromebook.currentUser ?
    `${chromebook.currentUser.firstName} ${chromebook.currentUser.lastName}` :
    'Unknown Student';

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Payment Collection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Damage Fee Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Student:</span>
              <span className="font-medium">{studentName}</span>
            </div>
            <div className="flex justify-between">
              <span>Device:</span>
              <span className="font-medium">{chromebook.assetTag}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Damage Cost:</span>
              <span className="font-bold text-lg text-red-600 dark:text-red-400">
                ${totalCost.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Insurance Status:</span>
              <span>{getInsuranceStatusDisplay(chromebook)}</span>
            </div>
          </div>
        </div>

        {totalCost <= 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
              No Payment Needed
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              This device has no damage fees or the cost has been waived.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                variant={paymentAmount > 0 ? "default" : "outline"}
                className="flex-1"
                onClick={() => setPaymentAmount(totalCost)}
              >
                Pay Full Amount (${totalCost.toFixed(2)})
              </Button>
              <Button
                variant={paymentAmount === 0 ? "default" : "outline"}
                className="flex-1"
                onClick={() => setPaymentAmount(0)}
              >
                Pay Later
              </Button>
            </div>

            {paymentAmount > 0 && (
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
                <h4 className="font-semibold">Payment Details</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="paymentAmount">Payment Amount</Label>
                    <Input
                      id="paymentAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      max={totalCost}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Check">Check</SelectItem>
                        <SelectItem value="Credit Card">Credit Card</SelectItem>
                        <SelectItem value="Money Order">Money Order</SelectItem>
                        <SelectItem value="Online Payment">Online Payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="paymentNotes">Notes (Optional)</Label>
                  <Textarea
                    id="paymentNotes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Transaction details, check number, etc."
                    rows={2}
                  />
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span>Payment Amount:</span>
                    <span className="font-semibold">${paymentAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Remaining Balance:</span>
                    <span className="font-semibold">
                      ${(totalCost - paymentAmount).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {paymentAmount === 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                      Payment Deferred
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      The full amount of ${totalCost.toFixed(2)} will be added to the student's account as an outstanding fee.
                      Payment can be processed later through the student's profile.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onPrevious}
            disabled={isSubmitting}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Complete Check-in
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const CheckinWorkflow: React.FC<CheckinWorkflowProps> = ({ chromebook, onComplete, isModal = false }) => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('assessment');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [damageLocations, setDamageLocations] = useState<DamageLocation[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [newlyCreatedFee, setNewlyCreatedFee] = useState<StudentFee | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [serviceType, setServiceType] = useState<'return' | 'service'>('return');
  const [deviceInService, setDeviceInService] = useState<boolean>(false);
  const [maintenanceId, setMaintenanceId] = useState<string | number | null>(null);
  const { token } = useAuth();

  const form = useForm<CheckinFormValues>({
    resolver: zodResolver(checkinFormSchema),
    defaultValues: {
      condition: 'good',
      chargerReturned: true,
      waiveCost: false,
      damageLocations: [],
      photos: [],
      repairRecommendations: [],
      totalCost: 0,
      notes: '',
      specialInstructions: '',
    },
  });

    // Reset workflow state when component mounts
    useEffect(() => {
      console.log(`🔍 [CheckinWorkflow Debug] Component mounted with chromebook:`, {
        assetTag: chromebook.assetTag,
        isInsured: chromebook.isInsured,
        insurance_status: chromebook.insurance_status,
        currentUser: chromebook.currentUser
      });

      // For checked-out devices, start with verification -> service type
      // For other devices, skip service type selection
      if (chromebook.status === 'checked-out') {
        setCurrentStep('verification');
      } else {
        setCurrentStep('assessment');
      }
    setIsSubmitting(false);
    setIsCompleted(false);
    setDamageLocations([]);
    setUploadedPhotos([]);
    form.reset();

    const fetchUserAndFees = async () => {
      let userId = chromebook.currentUser?.id;

      // If user ID is missing or 0, fetch it using studentId
      if (!userId || userId === 0) {
        if (chromebook.currentUser?.studentId) {
          try {
            const userResponse = await fetch(`/api/users/by-student-id/${chromebook.currentUser.studentId}`, {
              headers: {
                ...(token && { 'Authorization': `Bearer ${token}` }),
              },
            });
            if (userResponse.ok) {
              const userData = await userResponse.json();
              userId = userData.id;
              // Update the chromebook's currentUser with the fetched ID
              if (chromebook.currentUser) {
                chromebook.currentUser.id = userId;
              }
            }
          } catch (error) {
            console.error("Failed to fetch user by student ID", error);
          }
        }
      }

      // Now fetch fees if we have a valid user ID
      if (userId && userId > 0) {
        try {
          const response = await fetch(`/api/students/${userId}/fees`, {
            headers: {
              ...(token && { 'Authorization': `Bearer ${token}` }),
            },
          });
          if (response.ok) {
            const fees = await response.json();
            setStudentFees(fees);
          } else {
            console.error("Failed to fetch student fees, status:", response.status);
          }
        } catch (error) {
          console.error("Failed to fetch student fees", error);
        }
      }
    };

    fetchUserAndFees();
  }, [chromebook.id, chromebook.currentUser?.studentId, token]);

  // Log insurance fee information when student fees are loaded
  useEffect(() => {
    if (studentFees.length > 0) {
      const insuranceFeeWithBalance = studentFees.find(
        (fee) => fee.description === 'Device Insurance Fee' && fee.balance > 0
      );
      const anyInsuranceFee = studentFees.find(
        (fee) => fee.description === 'Device Insurance Fee'
      );

      console.log(`💰 [CheckinWorkflow Debug] Insurance fee data for ${chromebook.assetTag}:`, {
        insuranceFeeWithBalance: insuranceFeeWithBalance || null,
        anyInsuranceFee: anyInsuranceFee || null,
        insurancePaidInFull: anyInsuranceFee && anyInsuranceFee.balance === 0,
        chromebookInsuranceStatus: {
          isInsured: chromebook.isInsured,
          insurance_status: chromebook.insurance_status
        },
        totalStudentFees: studentFees.length,
        allFees: studentFees.map(fee => ({
          id: fee.id,
          description: fee.description,
          amount: fee.amount,
          balance: fee.balance,
          created_at: fee.created_at,
          payments: fee.payments?.length || 0
        }))
      });
    } else {
      console.log(`💰 [CheckinWorkflow Debug] No student fees loaded yet for ${chromebook.assetTag}`);
    }
  }, [studentFees, chromebook.assetTag]);

  const calculateRepairRecommendations = (damages: DamageLocation[]): RepairRecommendation[] => {
    const recommendations: RepairRecommendation[] = [];
    const hasCriticalDamage = damages.some(d => d.severity === 'critical');
    const majorDamageCount = damages.filter(d => d.severity === 'major').length;

    if (hasCriticalDamage || majorDamageCount >= 3) {
      return [{
        item: 'Full Chromebook Replacement',
        cost: 350,
        priority: 'high',
        description: 'Multiple major issues or critical damage detected. Replacement recommended.'
      }];
    }

    const damageMap: { [key: string]: Omit<RepairRecommendation, 'description'> } = {
      'Screen': { item: 'Screen Replacement', cost: 100, priority: 'high' },
      'Keyboard': { item: 'Keyboard Replacement', cost: 40, priority: 'medium' },
      'Trackpad': { item: 'Trackpad Replacement', cost: 35, priority: 'medium' },
      'Charging Port': { item: 'Charging Port Repair', cost: 50, priority: 'high' },
      'Camera': { item: 'Camera Replacement', cost: 30, priority: 'low' },
      'Hinge': { item: 'Hinge Repair/Replacement', cost: 60, priority: 'medium' },
      'Bottom Case': { item: 'Body/Chassis Replacement', cost: 80, priority: 'medium' },
    };

    const uniqueRecommendations = new Map<string, RepairRecommendation>();

    damages.forEach(damage => {
      const recommendationTemplate = damageMap[damage.area];
      if (recommendationTemplate && !uniqueRecommendations.has(recommendationTemplate.item)) {
        uniqueRecommendations.set(recommendationTemplate.item, {
          ...recommendationTemplate,
          description: `Repair/replacement due to ${damage.damageType.toLowerCase()}.`,
        });
      }
    });

    if (damages.length > 0 && uniqueRecommendations.size === 0) {
      uniqueRecommendations.set('General Assessment Required', {
        item: 'General Assessment Required',
        cost: 0,
        priority: 'low',
        description: 'Device requires technical assessment to determine repair needs.'
      });
    }

    return Array.from(uniqueRecommendations.values());
  };

  const onSubmit = async (data: CheckinFormValues) => {
    setIsSubmitting(true);

    try {
      // Convert photos to base64
      const photoBase64Array: string[] = [];
      for (const photo of uploadedPhotos) {
        try {
          const base64 = await convertFileToBase64(photo);
          photoBase64Array.push(base64);
        } catch (error) {
          console.error('Error converting photo to base64:', error);
          // Continue with other photos if one fails
        }
      }

      // Prepare the checkin data
      const checkinData = {
        chromebook_id: chromebook.id,
        condition: data.condition,
        damage_locations: damageLocations,
        repair_recommendations: calculateRepairRecommendations(damageLocations),
        total_cost: data.totalCost,
        notes: data.notes || null,
        special_instructions: data.specialInstructions || null,
        photos: photoBase64Array,
        cost_waived: data.waiveCost,
        service_type: serviceType,
      };

      // Send the checkin request to the API
      const response = await fetch('/api/checkins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(checkinData),
      });

      if (response.status === 409) {
        // Device is already in service
        const errorData = await response.json();
        if (errorData.in_service && errorData.maintenance_id) {
          toast({
            title: "Device Already in Service",
            description: "This device is currently being serviced. Redirecting to maintenance page...",
            variant: "destructive"
          });

          // Redirect to maintenance page
          setTimeout(() => {
            window.location.href = `/maintenance?deviceId=${errorData.maintenance_id}`;
          }, 2000);
          return;
        } else {
          throw new Error(errorData.message || 'Device conflict detected');
        }
      } else if (response.ok) {
        const result = await response.json();
        toast({
          title: "Checkin Successful!",
          description: `${chromebook.assetTag} has been checked in successfully.`,
        });
        setIsCompleted(true);

        // If a payment was made during the workflow, add it now
        if (data.totalCost && data.totalCost > 0 && !chromebook.isInsured && !data.waiveCost && paymentAmount > 0 && chromebook.currentUser?.id) {
          try {
            // Fetch the student's fees to get the newly created fee
            const feesResponse = await fetch(`/api/students/${chromebook.currentUser.id}/fees`, {
              headers: {
                ...(token && { 'Authorization': `Bearer ${token}` }),
              },
            });

            if (feesResponse.ok) {
              const fees = await feesResponse.json();
              // Find the most recent fee (likely the one just created)
              const recentFee = fees.find((fee: StudentFee) =>
                fee.maintenance_id === result.checkin?.maintenanceRecordId
              );

              if (recentFee) {
                // Add the payment that was collected during the workflow
                const paymentResponse = await fetch(`/api/fees/${recentFee.id}/payments`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                  },
                  body: JSON.stringify({
                    amount: paymentAmount,
                    payment_method: paymentMethod,
                    notes: paymentNotes
                  }),
                });

                if (paymentResponse.ok) {
                  toast({
                    title: 'Payment Added',
                    description: `Payment of $${paymentAmount.toFixed(2)} has been recorded.`,
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error processing payment:', error);
          }
        }

        setCurrentStep('confirmation');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Checkin failed');
      }

    } catch (err) {
      console.error('Error during checkin:', err);
      toast({
        title: "Checkin Failed",
        description: err instanceof Error ? err.message : "There was an error processing the checkin. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Conditionally include service_type step for checked-out devices
  const steps = chromebook.status === 'checked-out'
    ? [
        { id: 'verification', title: 'Device Verification', icon: User },
        { id: 'service_type', title: 'Service Type', icon: FileText },
        { id: 'assessment', title: 'Condition Assessment', icon: Laptop },
        { id: 'processing', title: 'Processing & Documentation', icon: FileText },
        { id: 'payment', title: 'Payment', icon: DollarSign },
        { id: 'confirmation', title: 'Confirmation', icon: CheckCircle },
      ]
    : [
        { id: 'assessment', title: 'Condition Assessment', icon: Laptop },
        { id: 'processing', title: 'Processing & Documentation', icon: FileText },
        { id: 'payment', title: 'Payment', icon: DollarSign },
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
                  "text-xs mt-2 font-medium text-center max-w-20",
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

  const canProceedToNextStep = () => {
    switch (currentStep) {
      case 'verification':
        return true; // Always can proceed from verification
      case 'assessment':
        return form.watch('condition') !== undefined;
      case 'processing':
        return true;
      default:
        return true;
    }
  };

  const getNextStep = (): WorkflowStep | null => {
    // Different step orders based on device status
    const baseStepOrder: WorkflowStep[] = chromebook.status === 'checked-out'
      ? ['verification', 'service_type', 'assessment', 'processing', 'payment', 'confirmation']
      : ['assessment', 'processing', 'payment', 'confirmation'];

    const currentIndex = baseStepOrder.indexOf(currentStep);

    // Skip payment step if no damage cost or device is insured or cost is waived
    if (baseStepOrder[currentIndex + 1] === 'payment') {
      const totalCost = form.watch('totalCost') || 0;
      const waiveCost = form.watch('waiveCost') || false;
      if (totalCost <= 0 || chromebook.isInsured || waiveCost) {
        return currentIndex < baseStepOrder.length - 2 ? baseStepOrder[currentIndex + 2] : null;
      }
    }

    return currentIndex < baseStepOrder.length - 1 ? baseStepOrder[currentIndex + 1] : null;
  };

  const getPreviousStep = (): WorkflowStep | null => {
    const baseStepOrder: WorkflowStep[] = chromebook.status === 'checked-out'
      ? ['verification', 'service_type', 'assessment', 'processing', 'payment', 'confirmation']
      : ['assessment', 'processing', 'payment', 'confirmation'];

    const currentIndex = baseStepOrder.indexOf(currentStep);

    // Skip payment step if no damage cost or device is insured or cost is waived
    if (baseStepOrder[currentIndex - 1] === 'payment') {
      const totalCost = form.watch('totalCost') || 0;
      const waiveCost = form.watch('waiveCost') || false;
      if (totalCost <= 0 || chromebook.isInsured || waiveCost) {
        return currentIndex > 1 ? baseStepOrder[currentIndex - 2] : null;
      }
    }

    return currentIndex > 0 ? baseStepOrder[currentIndex - 1] : null;
  };

  const handleNext = async () => {
    // Special handling for verification step - check if device is already in service
    if (currentStep === 'verification') {
      try {
        const response = await fetch(`/api/chromebooks/${chromebook.id}`, {
          headers: {
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
        });

        if (response.ok) {
          const deviceData = await response.json();

          // Check if device is in service
          if (deviceData.in_service) {
            // Get the active maintenance record ID
            try {
              const maintenanceResponse = await fetch(`/api/maintenance/active-service/${chromebook.id}`, {
                headers: {
                  ...(token && { 'Authorization': `Bearer ${token}` }),
                },
              });

              if (maintenanceResponse.ok) {
                const maintenanceData = await maintenanceResponse.json();
                setDeviceInService(true);
                setMaintenanceId(maintenanceData.id);
                return; // Don't proceed to next step
              }
            } catch (maintenanceError) {
              console.error('Error fetching maintenance record:', maintenanceError);
            }

            // Even if we can't get the maintenance ID, still show the in-service component
            setDeviceInService(true);
            setMaintenanceId(null);
            return;
          }
        }
      } catch (error) {
        console.error('Error checking device service status:', error);
      }
    }

    const nextStep = getNextStep();
    if (nextStep && canProceedToNextStep()) {
      setCurrentStep(nextStep);
    }
  };

  const handlePrevious = () => {
    const previousStep = getPreviousStep();
    if (previousStep) {
      setCurrentStep(previousStep);
    }
  };

  const handleSubmit = () => {
    if (currentStep === 'processing') {
      // Check if we need to show payment step
      const totalCost = form.watch('totalCost') || 0;
      const waiveCost = form.watch('waiveCost') || false;
      if (totalCost > 0 && !chromebook.isInsured && !waiveCost) {
        setCurrentStep('payment');
      } else {
        form.handleSubmit(onSubmit)();
      }
    } else if (currentStep === 'payment') {
      form.handleSubmit(onSubmit)();
    }
  };

  const insuranceFee = studentFees.find(
    (fee) => fee.description === 'Device Insurance Fee' && fee.balance > 0
  );

  return (
    <div className="w-full">
      {!isModal && !deviceInService && renderStepIndicator()}

      {deviceInService && (
        <DeviceInService
          chromebook={chromebook}
          maintenanceId={maintenanceId}
          onPrevious={() => {
            setDeviceInService(false);
            setMaintenanceId(null);
            setCurrentStep('verification');
          }}
        />
      )}

      {currentStep === 'verification' && !isModal && !deviceInService && (
        <DeviceVerification
          chromebook={chromebook}
          onNext={handleNext}
          insuranceFee={insuranceFee}
        />
      )}

      {currentStep === 'service_type' && !deviceInService && (
        <ServiceTypeSelection
          chromebook={chromebook}
          onSelect={(type) => {
            setServiceType(type);
            setCurrentStep('assessment');
          }}
          onPrevious={handlePrevious}
        />
      )}

      {currentStep === 'assessment' && (
        <DamageAssessment
          chromebook={chromebook}
          damageLocations={damageLocations}
          onDamageLocationsChange={setDamageLocations}
          uploadedPhotos={uploadedPhotos}
          onPhotosChange={setUploadedPhotos}
          form={form}
          onNext={handleNext}
          onPrevious={handlePrevious}
          isInsured={chromebook.isInsured || false}
        />
      )}

      {currentStep === 'processing' && (
        <ProcessingDetails
          chromebook={chromebook}
          damageLocations={damageLocations}
          repairRecommendations={calculateRepairRecommendations(damageLocations)}
          totalCost={form.watch('totalCost') || 0}
          form={form}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onPrevious={handlePrevious}
        />
      )}

      {currentStep === 'payment' && (
        <PaymentStep
          chromebook={chromebook}
          totalCost={form.watch('totalCost') || 0}
          paymentAmount={paymentAmount}
          setPaymentAmount={setPaymentAmount}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentNotes={paymentNotes}
          setPaymentNotes={setPaymentNotes}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onPrevious={handlePrevious}
        />
      )}

      {currentStep === 'confirmation' && (
        <CheckinConfirmation
          chromebook={chromebook}
          damageLocations={damageLocations}
          repairRecommendations={calculateRepairRecommendations(damageLocations)}
          totalCost={form.getValues('totalCost') || 0}
          notes={form.getValues('notes')}
          specialInstructions={form.getValues('specialInstructions')}
          onComplete={() => onComplete?.(form.getValues())}
        />
      )}

      {showPaymentDialog && newlyCreatedFee && (
        <AddPaymentDialog
          fee={newlyCreatedFee}
          onAddPayment={async (feeId, amount, paymentMethod, notes) => {
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
              setShowPaymentDialog(false);
              setCurrentStep('confirmation');
            } catch (error) {
              toast({
                title: 'Error',
                description: 'Failed to add payment.',
                variant: 'destructive',
              });
            }
          }}
        />
      )}
    </div>
  );
};
