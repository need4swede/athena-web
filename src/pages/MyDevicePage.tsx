import React, { useState, useEffect, useRef } from 'react';
import { SignatureCapture, SignatureCaptureHandle } from '@/components/Checkout/SignatureCapture';
import PDFViewer from '@/components/PDFViewer';
import { toast } from '@/hooks/use-toast';
import { ShieldCheck, X, User, Mail, Hash, Building, Laptop, Calendar, Check, DollarSign, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInsuranceStatusDisplay } from '@/lib/insurance-utils';
import './MyDevicePage.css';
import { Button } from '@/components/ui/button';
import useMobile from '@/hooks/use-mobile';
import MobileActions from '@/components/MyDevice/MobileActions';
import { ThemeProvider } from '@/components/ThemeProvider';

// Helper function to format Org Unit Path
const formatOrgUnitPath = (path: string) => {
    if (!path) return 'N/A';
    const parts = path.split('/').filter(Boolean);
    return parts.map(part => part.replace(/\(\d+\)/g, '').trim()).join(' - ');
};

const MyDevicePageContent = () => {
    const [serialNumber, setSerialNumber] = useState('');
    const [studentId, setStudentId] = useState('');
    const [error, setError] = useState('');
    const [deviceInfo, setDeviceInfo] = useState<any>(null);
    const [studentInfo, setStudentInfo] = useState<any>(null);
    const [checkoutHistory, setCheckoutHistory] = useState<any[]>([]);
    const [fees, setFees] = useState<any[]>([]);
    const [insuranceFee, setInsuranceFee] = useState<any | null>(null);
    const [ltcFee, setLtcFee] = useState<number>(40);
    const [token, setToken] = useState<string | null>(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [isInsured, setIsInsured] = useState<boolean | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [agreementUrl, setAgreementUrl] = useState<string | null>(null);
    const [signatureStep, setSignatureStep] = useState(0); // 0: initial, 1: insurance selected, 2: signing
    const signaturePadRef = useRef<SignatureCaptureHandle>(null);
    const isMobile = useMobile();

    const performLogin = async (serial: string, studentId: string) => {
        setError('');
        setIsLoading(true);

        try {
            // Simulate network delay for UX
            await new Promise(resolve => setTimeout(resolve, 1000));

            const response = await fetch('/api/portal/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serial_number: serial, student_id: studentId }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Login failed');
            }

            const { token, device, student, history } = await response.json();
            setToken(token);
            setDeviceInfo(device);
            setStudentInfo(student);
            setCheckoutHistory(history || []);

            const feesResponse = await fetch('/api/portal/fees', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (feesResponse.ok) {
                const feesData = await feesResponse.json();
                setFees(feesData.fees);
                const foundInsuranceFee = feesData.fees.find((fee: any) => fee.description === 'Device Insurance Fee');
                setInsuranceFee(foundInsuranceFee);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch LTC fee configuration
    const fetchLtcFee = async () => {
        try {
            const response = await fetch('/api/checkouts/config/fees');
            if (response.ok) {
                const config = await response.json();
                setLtcFee(config.ltcFee || 40);
            }
        } catch (error) {
            console.error('Error fetching LTC fee:', error);
        }
    };

    useEffect(() => {
        fetchLtcFee();
        const urlParams = new URLSearchParams(window.location.search);
        const serial = urlParams.get('serial');
        const id = urlParams.get('id');

        if (serial && id) {
            setSerialNumber(serial);
            setStudentId(id);
            performLogin(serial, id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (showSignatureModal && token) {
            const fetchAgreementUrl = async () => {
                try {
                    const response = await fetch('/api/portal/agreement-url', {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!response.ok) {
                        throw new Error('Could not load agreement URL');
                    }
                    const data = await response.json();
                    setAgreementUrl(data.url);
                } catch (err: any) {
                    setError(err.message);
                }
            };
            fetchAgreementUrl();
        }
    }, [showSignatureModal, token]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        performLogin(serialNumber, studentId);
    };

    const handleSignAgreement = async () => {
        if (!token || isInsured === undefined || !signaturePadRef.current || isSubmitting) return;

        const parentSignature = signaturePadRef.current.getSignature();
        if (!parentSignature) {
            toast({
                title: 'Signature Required',
                description: 'Please provide a signature before completing the agreement.',
                variant: 'destructive',
            });
            return;
        }

        const pendingCheckout = checkoutHistory.find(h => h.status === 'pending');
        if (!pendingCheckout) {
            setError("No pending agreement found to sign.");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/portal/sign/${pendingCheckout.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ parent_signature: parentSignature, is_insured: isInsured }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to sign agreement');
            }

            toast({
                title: "Agreement Signed",
                description: "The checkout process is now complete.",
            });
            setShowSignatureModal(false);
            setDeviceInfo({ ...deviceInfo, status: 'checked_out' }); // Update status locally
            setSignatureStep(0); // Reset step

            // Update checkout history to reflect completion
            setCheckoutHistory(prev => prev.map(h =>
                h.id === pendingCheckout.id
                    ? { ...h, status: 'completed', parent_signature: parentSignature }
                    : h
            ));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInsuranceSelection = (status: boolean) => {
        setIsInsured(status);
        setSignatureStep(1);
    };

    const handleOpenSignatureModal = () => {
        setIsInsured(undefined);
        setSignatureStep(0);
        setShowSignatureModal(true);
    };

    const handleCloseModal = () => {
        setShowSignatureModal(false);
        setSignatureStep(0);
        setIsInsured(undefined);
    };

    if (deviceInfo) {
        return (
            <>
                <div className="my-device-page">
                    <div className="device-info-card">
                        <div className="card-header">
                            <h1 className="card-title">Device Status</h1>
                            <p className="card-description">View details about your checked-out device.</p>
                        </div>
                        <div className="card-content">
                            <div className="info-section">
                                <h2 className="info-title">Student Information</h2>
                                <div className="info-grid">
                                    <div className="info-item"><User className="icon h-5 w-5" /><span>{studentInfo.first_name} {studentInfo.last_name}</span></div>
                                    <div className="info-item"><Mail className="icon h-5 w-5" /><span>{studentInfo.email}</span></div>
                                    <div className="info-item"><Hash className="icon h-5 w-5" /><span>{studentInfo.student_id}</span></div>
                                    <div className="info-item"><Building className="icon h-5 w-5" /><span>{formatOrgUnitPath(studentInfo.org_unit_path)}</span></div>
                                </div>
                            </div>
                            <div className="info-section">
                                <h2 className="info-title">Device Information</h2>
                                <div className="info-grid">
                                    <div className="info-item"><Laptop className="icon h-5 w-5" /><span>Asset Tag: {deviceInfo.asset_tag}</span></div>
                                    <div className="info-item"><Laptop className="icon h-5 w-5" /><span>Serial: {deviceInfo.serial_number}</span></div>
                                    <div className="info-item"><Calendar className="icon h-5 w-5" /><span>Checkout: {new Date(deviceInfo.checkout_date).toLocaleDateString()}</span></div>
                                </div>
                            </div>
                            <div className="mt-4">
                                {deviceInfo.status === 'pending_signature' && (
                                    <button onClick={handleOpenSignatureModal} className="action-button primary-action">
                                        Sign Agreement
                                    </button>
                                )}
                                {deviceInfo.status === 'checked_out' && (
                                     <button onClick={() => window.open(`/api/portal/agreement?token=${token}`, '_blank')} className="action-button secondary-action">
                                        View Signed Agreement
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                {showSignatureModal && (
                    <div className="modal-overlay-tos">
                        <div className={cn("modal-content-tos", isMobile && signatureStep === 2 && "show-signature")}>
                            <div className="pdf-viewer-tos">
                                {agreementUrl ? (
                                    <PDFViewer file={agreementUrl} />
                                ) : (
                                    <div className="pdf-loader">Loading agreement...</div>
                                )}
                            </div>
                            {!isMobile ? (
                                <div className="signature-workflow-tos">
                                    {signatureStep < 2 && (
                                        <div className="insurance-selection-tos">
                                            <h3 className="insurance-title-tos">1. Select Insurance Option</h3>
                                            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                                <div className="flex items-center space-x-2 mb-2">
                                                    <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                                        Insurance Fee: ${ltcFee}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-blue-600 dark:text-blue-400">
                                                    This fee will be created and must be paid to complete insurance coverage.
                                                </p>
                                            </div>
                                            <div className="insurance-options-tos">
                                                <button
                                                    className={cn("insurance-button-tos not-insured", isInsured === false && "selected")}
                                                    onClick={() => handleInsuranceSelection(false)}
                                                >
                                                    <X />
                                                    <span>Decline Insurance</span>
                                                </button>
                                                <button
                                                    className={cn("insurance-button-tos insured", isInsured === true && "selected")}
                                                    onClick={() => handleInsuranceSelection(true)}
                                                >
                                                    <ShieldCheck />
                                                    <span>Accept Insurance <br></br>(${ltcFee} fee)</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {signatureStep === 1 && (
                                        <div className="prompt-to-sign-tos" onClick={() => setSignatureStep(2)}>
                                            <h3 className="prompt-title-tos">2. Ready to Sign?</h3>
                                            <p className="prompt-description-tos">
                                                You've selected: <strong>{isInsured ? `Accept Insurance (${ltcFee} fee will be created)` : "Decline Insurance"}</strong>
                                            </p>
                                            <div className="prompt-action-tos">Click here to proceed to signature</div>
                                        </div>
                                    )}

                                    {signatureStep === 2 && (
                                        <div className="signature-capture-tos">
                                            <div className="signature-header-tos">
                                                <h3 className="signature-title-tos">3. Provide Parent/Guardian Signature</h3>
                                                <Button variant="link" size="sm" onClick={() => signaturePadRef.current?.clear()}>
                                                    Clear
                                                </Button>
                                            </div>
                                            <div className="border-2 border-gray-300 dark:border-gray-600 rounded-xl p-4 shadow-inner bg-gray-50 dark:bg-gray-800/50">
                                                <h4 className="text-lg font-medium mb-2 text-center text-gray-800 dark:text-gray-200">
                                                    Parent / Guardian Agreement
                                                </h4>
                                                <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                                    <SignatureCapture ref={signaturePadRef} />
                                                </div>
                                            </div>
                                            <div className="signature-footer-tos">
                                                <Button onClick={handleCloseModal} variant="outline" disabled={isSubmitting}>
                                                    Back
                                                </Button>
                                                <Button onClick={handleSignAgreement} disabled={isSubmitting}>
                                                    {isSubmitting ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Processing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check className="mr-2 h-4 w-4" />
                                                            Complete and Sign Agreement
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <MobileActions
                                        isInsured={isInsured}
                                        onInsuranceSelection={handleInsuranceSelection}
                                        onReadyToSign={() => setSignatureStep(2)}
                                        signatureStep={signatureStep}
                                        ltcFee={ltcFee}
                                    />
                                    <div className="signature-modal-mobile">
                                        <div className="signature-capture-tos">
                                            <div className="signature-header-tos">
                                                <h3 className="signature-title-tos">Parent/Guardian Signature</h3>
                                                <Button variant="link" size="sm" onClick={() => signaturePadRef.current?.clear()}>
                                                    Clear
                                                </Button>
                                            </div>
                                            <div className="border-2 border-gray-300 dark:border-gray-600 rounded-xl p-4 shadow-inner bg-gray-50 dark:bg-gray-800/50">
                                                <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                                    <SignatureCapture ref={signaturePadRef} />
                                                </div>
                                            </div>
                                            <div className="signature-footer-tos">
                                                <Button onClick={handleCloseModal} variant="outline" disabled={isSubmitting}>
                                                    Cancel
                                                </Button>
                                                <Button onClick={handleSignAgreement} disabled={isSubmitting}>
                                                    {isSubmitting ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Processing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check className="mr-2 h-4 w-4" />
                                                            Submit
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="my-device-page">
            <div className="login-card">
                <div className="card-header">
                    <h1 className="card-title">Device Status Portal</h1>
                    <p className="card-description">Enter your device and student ID to view its status.</p>
                </div>
                <div className="card-content">
                    <form onSubmit={handleLogin}>
                        <div className="input-group">
                            <Laptop className="input-icon h-5 w-5" />
                            <input
                                type="text"
                                placeholder="Device Serial Number"
                                value={serialNumber}
                                onChange={(e) => setSerialNumber(e.target.value)}
                                required
                                className="input-field"
                            />
                        </div>
                        <div className="input-group">
                            <User className="input-icon h-5 w-5" />
                            <input
                                type="text"
                                placeholder="Student ID"
                                value={studentId}
                                onChange={(e) => setStudentId(e.target.value)}
                                required
                                className="input-field"
                            />
                        </div>
                        {error && <p className="error-message">{error}</p>}
                        <button type="submit" className="submit-button" disabled={isLoading}>
                            {isLoading ? <div className="loader" /> : 'Check Status'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

const MyDevicePage = () => {
    return (
        <ThemeProvider>
            <MyDevicePageContent />
        </ThemeProvider>
    );
};

export default MyDevicePage;
