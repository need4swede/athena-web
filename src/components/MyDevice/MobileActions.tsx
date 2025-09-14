import React from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, X, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileActionsProps {
    isInsured: boolean | undefined;
    onInsuranceSelection: (status: boolean) => void;
    onReadyToSign: () => void;
    signatureStep: number;
    ltcFee: number;
}

const MobileActions: React.FC<MobileActionsProps> = ({
    isInsured,
    onInsuranceSelection,
    onReadyToSign,
    signatureStep,
    ltcFee,
}) => {
    if (signatureStep > 0) {
        return (
            <div className="mobile-actions-footer">
                <div className="prompt-to-sign-mobile">
                    <div className="prompt-text">
                        <p className="prompt-description">
                            You've selected: <strong>{isInsured ? `Accept Insurance ($${ltcFee} fee will be created)` : "Decline Insurance"}</strong>
                        </p>
                    </div>
                    <Button onClick={onReadyToSign} className="w-full">
                        Ready to Sign
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="mobile-actions-footer">
            <div className="insurance-selection-mobile">
                <h3 className="insurance-title-mobile">Select Insurance</h3>

                {/* Fee Information */}
                <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center space-x-2 mb-1">
                        <DollarSign className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                            Insurance Fee: ${ltcFee}
                        </span>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                        Fee will be created and must be paid to complete coverage.
                    </p>
                </div>

                <div className="insurance-options-mobile">
                    <button
                        className={cn("insurance-button-mobile not-insured", isInsured === false && "selected")}
                        onClick={() => onInsuranceSelection(false)}
                    >
                        <X />
                        <span>Decline</span>
                    </button>
                    <button
                        className={cn("insurance-button-mobile insured", isInsured === true && "selected")}
                        onClick={() => onInsuranceSelection(true)}
                    >
                        <ShieldCheck />
                        <span>Accept <span className="text-xs">(${ltcFee})</span></span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileActions;
