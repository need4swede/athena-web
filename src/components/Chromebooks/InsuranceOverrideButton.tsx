import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Chromebook } from '@/types/chromebook';
import { getInsuranceStatusDisplay } from '@/lib/insurance-utils';

interface InsuranceOverrideButtonProps {
  chromebook: Chromebook;
  userRole?: string;
  onOverrideComplete?: () => void;
}

const INSURANCE_STATUS_OPTIONS = [
  { value: 'insured', label: 'Insured', description: 'Device is covered by insurance' },
  { value: 'pending', label: 'Not Insured (Payment Pending)', description: 'Insurance fee needs to be paid' },
  { value: 'uninsured', label: 'Not Insured', description: 'No insurance coverage' }
];

export const InsuranceOverrideButton: React.FC<InsuranceOverrideButtonProps> = ({
  chromebook,
  userRole,
  onOverrideComplete
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Only show for super admins on checked out or pending signature devices
  if (userRole !== 'super_admin' ||
      !['checked-out', 'pending_signature'].includes(chromebook.status)) {
    return null;
  }

  const currentStatus = chromebook.insurance_status || (chromebook.isInsured ? 'insured' : 'uninsured');

  const handleOverride = async () => {
    if (!newStatus) {
      toast({
        title: "Missing Selection",
        description: "Please select a new insurance status.",
        variant: "destructive"
      });
      return;
    }

    if (newStatus === currentStatus) {
      toast({
        title: "No Change",
        description: "The selected status is the same as the current status.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        toast({
          title: "Authentication Error",
          description: "You are not authenticated. Please log in again.",
          variant: "destructive"
        });
        return;
      }

      const response = await fetch('/api/insurance-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          chromebook_id: parseInt(chromebook.id),
          new_insurance_status: newStatus,
          override_reason: reason.trim() || undefined
        })
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Insurance Override Successful",
          description: result.message || "Insurance status has been updated successfully.",
          variant: "default"
        });

        // Show workflow explanation if provided
        if (result.data?.workflow_explanation) {
          setTimeout(() => {
            toast({
              title: "Workflow Details",
              description: result.data.workflow_explanation,
              duration: 8000
            });
          }, 1000);
        }

        // Close dialog and reset form
        setIsDialogOpen(false);
        setNewStatus('');
        setReason('');

        // Refresh chromebook data
        queryClient.invalidateQueries({ queryKey: ['chromebooks'] });
        queryClient.invalidateQueries({ queryKey: ['chromebook', chromebook.id] });

        // Call completion callback
        onOverrideComplete?.();

      } else {
        toast({
          title: "Override Failed",
          description: result.message || "Failed to override insurance status.",
          variant: "destructive"
        });
      }

    } catch (error) {
      console.error('Insurance override error:', error);
      toast({
        title: "System Error",
        description: "Failed to communicate with the server. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsDialogOpen(true)}
        className="h-6 w-6 p-0 hover:bg-teal-100 dark:hover:bg-teal-800/50"
        title="Override Insurance Status (Super Admin)"
      >
        <Settings className="h-3 w-3 text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300" />
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-teal-600" />
              Override Insurance Status
            </DialogTitle>
            <DialogDescription>
              Override the insurance status for <strong>{chromebook.assetTag}</strong>
              <br />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Current status: <strong>{getInsuranceStatusDisplay(chromebook)}</strong>
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-status">New Insurance Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new status..." />
                </SelectTrigger>
                <SelectContent>
                  {INSURANCE_STATUS_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={option.value === currentStatus}
                    >
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-gray-500">{option.description}</span>
                        {option.value === currentStatus && (
                          <span className="text-xs text-blue-600">(Current Status)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Override (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Explain why this override is necessary..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            {newStatus && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                  What will happen:
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {newStatus === 'insured' || newStatus === 'pending' ? (
                    <>
                      • Device status will be set to "Not Insured (Payment Pending)"
                      <br />
                      • A $40 insurance fee will be added to the student's account
                      <br />
                      • Future agreements will show insurance coverage after payment
                    </>
                  ) : (
                    <>
                      • Device status will be set to "Not Insured"
                      <br />
                      • Any unpaid insurance fees will be archived
                      <br />
                      • Future agreements will show no insurance coverage
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleOverride}
              disabled={!newStatus || isLoading}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {isLoading ? 'Processing...' : 'Override Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
