import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckoutStudentSearch } from '@/components/Checkout/CheckoutStudentSearch';
import { ChromebookSelection, ChromebookSelectionRef } from '@/components/Checkout/ChromebookSelection';
import { Chromebook } from '@/types/chromebook';
import { Checkbox } from "@/components/ui/checkbox";
import { DamageLocation } from '../Checkin/CheckinWorkflow';
import { MaintenanceDamageAssessment } from './MaintenanceDamageAssessment';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/components/sso/SSOProvider';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, User, Laptop, Shield, AlertTriangle, Download, X, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface SelectedStudent {
  firstName: string;
  lastName: string;
  studentId: string;
  email: string;
  id?: number;
}

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({ isOpen, onClose, onComplete }) => {
  const { token } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState<SelectedStudent | null>(null);
  const [selectedChromebook, setSelectedChromebook] = useState<Chromebook | null>(null);
  const [isInsured, setIsInsured] = useState(false);
  const [step, setStep] = useState(1);
  const [damageLocations, setDamageLocations] = useState<DamageLocation[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [maintenanceRecordId, setMaintenanceRecordId] = useState<number | null>(null);

  const chromebookSelectionRef = useRef<ChromebookSelectionRef>(null);

  // Reset modal state when it opens/closes
  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setSelectedStudent(null);
      setSelectedChromebook(null);
      setIsInsured(false);
      setStep(1);
      setDamageLocations([]);
      setTotalCost(0);
      setIsSubmitting(false);
      setIsCompleted(false);
      setMaintenanceRecordId(null);
    }
  }, [isOpen]);

  const handleSelectStudent = useCallback((student: SelectedStudent) => {
    setSelectedStudent(student);
    setTimeout(() => {
      chromebookSelectionRef.current?.focusSearch();
    }, 100);
  }, []);

  const handleSelectChromebook = useCallback((chromebook: Chromebook | null) => {
    setSelectedChromebook(chromebook);
  }, []);

  const handleNext = () => {
    if (step === 1 && selectedStudent && selectedChromebook) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const handleSave = async () => {
    if (!selectedStudent || !selectedChromebook) return;

    setIsSubmitting(true);

    try {
      // Create maintenance record
      const maintenanceData = {
        studentId: selectedStudent.studentId,
        assetTag: selectedChromebook.assetTag,
        isInsured,
        damageLocations,
        totalCost,
      };

      const response = await fetch('/api/maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(maintenanceData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create maintenance record');
      }

      const result = await response.json();
      setMaintenanceRecordId(result.id);
      setIsCompleted(true);

      toast({
        title: "Maintenance Record Created",
        description: `Device ${selectedChromebook.assetTag} has been added to maintenance successfully.`,
      });

      // Auto-close after a delay
      setTimeout(() => {
        onComplete();
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Error creating maintenance record:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create maintenance record. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateRepairRecommendations = (damages: DamageLocation[]) => {
    const recommendations: any[] = [];
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

    const damageMap: { [key: string]: any } = {
      'Screen': { item: 'Screen Replacement', cost: 100, priority: 'high' },
      'Keyboard': { item: 'Keyboard Replacement', cost: 40, priority: 'medium' },
      'Trackpad': { item: 'Trackpad Replacement', cost: 35, priority: 'medium' },
      'Charging Port': { item: 'Charging Port Repair', cost: 50, priority: 'high' },
      'Camera': { item: 'Camera Replacement', cost: 30, priority: 'low' },
      'Hinge': { item: 'Hinge Repair/Replacement', cost: 60, priority: 'medium' },
      'Bottom Case': { item: 'Body/Chassis Replacement', cost: 80, priority: 'medium' },
    };

    const uniqueRecommendations = new Map();

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

  const handleGenerateReceipt = async () => {
    if (!selectedStudent || !selectedChromebook || !maintenanceRecordId) return;

    try {
      const repairRecommendations = calculateRepairRecommendations(damageLocations);
      const maintenanceDate = new Date();

      // Build detailed notes including damage assessment information
      let detailedNotes = '';
      console.log('Receipt generation - damageLocations:', damageLocations);
      console.log('Receipt generation - totalCost:', totalCost);
      console.log('Receipt generation - isInsured:', isInsured);

      if (damageLocations && damageLocations.length > 0) {
        detailedNotes = `Device submitted for maintenance with ${damageLocations.length} identified damage location(s):\n`;
        damageLocations.forEach((damage, index) => {
          detailedNotes += `${index + 1}. ${damage.area}: ${damage.damageType} (${damage.severity} severity)`;
          if (damage.description) {
            detailedNotes += ` - ${damage.description}`;
          }
          detailedNotes += '\n';
        });

        if (repairRecommendations.length > 0) {
          detailedNotes += '\nRecommended repairs:\n';
          repairRecommendations.forEach((rec, index) => {
            detailedNotes += `${index + 1}. ${rec.item}: $${rec.cost.toFixed(2)} (${rec.priority} priority)\n`;
          });
        }

        detailedNotes += `\nTotal estimated repair cost: $${totalCost.toFixed(2)}`;
        detailedNotes += `\nInsurance status: ${isInsured ? 'Covered' : 'Not covered'}`;
      } else {
        detailedNotes = 'Device submitted for maintenance inspection and evaluation. No visible damage identified at time of intake.';
      }

      const receiptData = {
        chromebook: {
          assetTag: selectedChromebook.assetTag,
          serialNumber: selectedChromebook.serialNumber,
          model: selectedChromebook.model,
        },
        student: {
          name: `${selectedStudent.firstName} ${selectedStudent.lastName}`,
          studentId: selectedStudent.studentId,
        },
        maintenanceDate: maintenanceDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        isInsured,
        damageLocations: damageLocations.map(loc => ({
          area: loc.area,
          damageType: loc.damageType,
          severity: loc.severity,
          description: loc.description || '',
        })),
        repairRecommendations,
        totalCost,
        notes: detailedNotes,
        specialInstructions: totalCost > 0 && !isInsured
          ? 'Student will be responsible for repair costs as device is not covered by insurance.'
          : isInsured && totalCost > 0
          ? 'Repair costs may be covered by device insurance policy.'
          : 'No repair costs associated with this maintenance request.',
      };

      const response = await fetch('/api/receipts/maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(receiptData),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `maintenance_receipt_${selectedChromebook.assetTag}_${maintenanceDate.toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Receipt Generated",
          description: "Detailed maintenance receipt has been downloaded successfully.",
        });
      } else {
        throw new Error('Failed to generate receipt');
      }
    } catch (error) {
      console.error('Error generating receipt:', error);
      toast({
        title: "Error",
        description: "Failed to generate receipt. Please try again.",
        variant: "destructive",
      });
    }
  };

  const steps = [
    { id: 1, title: 'Selection', icon: User, description: 'Select student and device' },
    { id: 2, title: 'Insurance', icon: Shield, description: 'Verify insurance status' },
    { id: 3, title: 'Assessment', icon: AlertTriangle, description: 'Assess device condition' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step) + 1;

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-6">
      {steps.map((stepInfo, index) => {
        const Icon = stepInfo.icon;
        const isActive = step === stepInfo.id;
        const isStepCompleted = step > stepInfo.id || isCompleted;
        const isAccessible = step >= stepInfo.id;

        return (
          <React.Fragment key={stepInfo.id}>
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isStepCompleted
                    ? "bg-green-500 border-green-500 text-white"
                    : isActive
                    ? "bg-blue-500 border-blue-500 text-white"
                    : isAccessible
                    ? "border-gray-300 text-gray-400"
                    : "border-gray-200 text-gray-300"
                )}
              >
                {isStepCompleted ? <CheckCircle size={16} /> : <Icon size={16} />}
              </div>
              <span
                className={cn(
                  "text-xs mt-2 font-medium text-center max-w-20",
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                )}
              >
                {stepInfo.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-4 transition-all",
                  step > stepInfo.id || isCompleted
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

  const renderStep = () => {
    if (isCompleted) {
      return (
        <div className="text-center py-8">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
            Maintenance Record Created Successfully!
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Device {selectedChromebook?.assetTag} has been added to the maintenance system.
          </p>
          {totalCost > 0 && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">
              Estimated repair cost: ${totalCost.toFixed(2)}
            </p>
          )}
          <Button onClick={handleGenerateReceipt} variant="outline" className="mr-2">
            <Download className="mr-2 h-4 w-4" />
            Download Receipt
          </Button>
        </div>
      );
    }

    switch (step) {
      case 1:
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold">Select Student</h3>
              <CheckoutStudentSearch
                onSelectStudent={handleSelectStudent}
                selectedStudent={selectedStudent}
              />
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold">Select Chromebook</h3>
              <ChromebookSelection
                ref={chromebookSelectionRef}
                onSelectChromebook={handleSelectChromebook}
                selectedChromebook={selectedChromebook}
              />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Device Insurance Status
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Please verify if this device is covered by insurance. This affects potential repair costs.
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Insurance helps cover repair costs for accidental damage. Uninsured devices may result in higher out-of-pocket expenses.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className={cn(
                  "h-20 flex flex-col items-center justify-center space-y-2 border-2 transition-all duration-200",
                  !isInsured
                    ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 shadow-md"
                    : "border-gray-300 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/50"
                )}
                onClick={() => setIsInsured(false)}
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
                  isInsured
                    ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 shadow-md"
                    : "border-gray-300 hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-950/50"
                )}
                onClick={() => setIsInsured(true)}
              >
                <ShieldCheck className="h-6 w-6" />
                <span className="font-medium">Device is Insured</span>
              </Button>
            </div>

            {isInsured && (
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-700 dark:text-green-300">Insurance Confirmed</span>
                </div>
                <p className="text-sm text-green-600 dark:text-green-400">
                  This device is covered by insurance, which may reduce repair costs.
                </p>
              </div>
            )}

            {!isInsured && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <span className="font-medium text-yellow-700 dark:text-yellow-300">No Insurance Coverage</span>
                </div>
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  This device is not insured. Repair costs will be at full price.
                </p>
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Damage Assessment
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Assess the device condition and document any existing damage
              </p>
            </div>

            {selectedChromebook && selectedStudent && (
              <div className="w-full">
                <MaintenanceDamageAssessment
                  key={`maintenance-${selectedChromebook.id}-${selectedStudent.studentId}`}
                  chromebook={{
                    ...selectedChromebook,
                    currentUser: {
                      id: selectedStudent.id || 0,
                      firstName: selectedStudent.firstName,
                      lastName: selectedStudent.lastName,
                      studentId: selectedStudent.studentId,
                    },
                  }}
                  isInsured={isInsured}
                  onComplete={(data) => {
                    console.log('Damage assessment completed:', data);
                    setDamageLocations(data.damageLocations);
                    setTotalCost(data.totalCost);
                  }}
                />
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const canProceedToNext = () => {
    switch (step) {
      case 1:
        return selectedStudent && selectedChromebook;
      case 2:
        return true; // Insurance verification is optional
      case 3:
        return true; // Damage assessment is always allowed to proceed
      default:
        return false;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Laptop className="h-5 w-5" />
            Add Device to Maintenance
          </DialogTitle>
        </DialogHeader>

        {!isCompleted && renderStepIndicator()}

        <div className="min-h-[400px]">
          {renderStep()}
        </div>

        {!isCompleted && (
          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={isSubmitting}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step < 3 ? (
                <Button
                  onClick={handleNext}
                  disabled={!canProceedToNext() || isSubmitting}
                >
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Create Maintenance Record
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddDeviceModal;
