import React from 'react';
import { GoogleUser } from '@/types/user';
import { OrgUnitTreeNode } from '@/types/orgUnit';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SuspendUserDialogProps {
    isOpen: boolean;
    onClose: () => void;
    selectedUser: GoogleUser | null;
    suspensionReason: string;
    setSuspensionReason: (reason: string) => void;
    onConfirm: () => void;
    isProcessing: boolean;
}

export const SuspendUserDialog: React.FC<SuspendUserDialogProps> = ({
    isOpen,
    onClose,
    selectedUser,
    suspensionReason,
    setSuspensionReason,
    onConfirm,
    isProcessing
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Suspend User</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to suspend {selectedUser?.name.fullName}? This will prevent them from accessing Google services.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="suspensionReason">Reason for suspension (optional)</Label>
                        <Textarea
                            id="suspensionReason"
                            placeholder="Enter reason for suspension..."
                            value={suspensionReason}
                            onChange={(e) => setSuspensionReason(e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div className="flex justify-end space-x-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                onClose();
                                setSuspensionReason('');
                            }}
                            disabled={isProcessing}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={onConfirm}
                            disabled={isProcessing}
                        >
                            {isProcessing ? 'Suspending...' : 'Suspend User'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

interface MoveUserDialogProps {
    isOpen: boolean;
    onClose: () => void;
    selectedUser: GoogleUser | null;
    targetOrgUnit: string;
    setTargetOrgUnit: (orgUnit: string) => void;
    onConfirm: () => void;
    isProcessing: boolean;
    availableOrgUnits: OrgUnitTreeNode[];
}

export const MoveUserDialog: React.FC<MoveUserDialogProps> = ({
    isOpen,
    onClose,
    selectedUser,
    targetOrgUnit,
    setTargetOrgUnit,
    onConfirm,
    isProcessing,
    availableOrgUnits
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Move User</DialogTitle>
                    <DialogDescription>
                        Move {selectedUser?.name.fullName} to a different organizational unit.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="targetOrgUnit">Target Organizational Unit</Label>
                        <Select value={targetOrgUnit} onValueChange={setTargetOrgUnit}>
                            <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Select organizational unit" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableOrgUnits.map((orgUnit) => (
                                    <SelectItem key={orgUnit.id} value={orgUnit.orgUnitPath}>
                                        {orgUnit.orgUnitPath === '/' ? 'Root' : orgUnit.orgUnitPath}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex justify-end space-x-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                onClose();
                                setTargetOrgUnit('');
                            }}
                            disabled={isProcessing}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={onConfirm}
                            disabled={isProcessing || !targetOrgUnit}
                        >
                            {isProcessing ? 'Moving...' : 'Move User'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
