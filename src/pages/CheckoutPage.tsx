import React, { useState, useCallback, useRef } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { CheckoutWorkflow } from '@/components/Checkout/CheckoutWorkflow';
import { CheckoutStudentSearch } from '@/components/Checkout/CheckoutStudentSearch';
import { ChromebookSelection, ChromebookSelectionRef } from '@/components/Checkout/ChromebookSelection';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Chromebook } from '@/types/chromebook';
import { useAuth } from '@/components/sso/SSOProvider';
import { ShoppingCart } from 'lucide-react';

const CheckoutPage = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('checkout');
  const [selectedChromebook, setSelectedChromebook] = useState<Chromebook | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<{
    firstName: string;
    lastName: string;
    studentId: string;
    email: string;
  } | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

  const chromebookSelectionRef = useRef<ChromebookSelectionRef>(null);

  // Handle sidebar navigation
  const handleSectionChange = useCallback((section: string) => {
    setActiveSection(section);

    // Navigate to the appropriate page based on the selected section
    switch (section) {
      case 'dashboard':
        window.location.href = '/';
        break;
      case 'users':
        window.location.href = '/users';
        break;
      case 'chromebooks':
        window.location.href = '/chromebooks';
        break;
      case 'org-units':
        window.location.href = '/org-units';
        break;
      case 'checkin':
        window.location.href = '/checkin';
        break;
      case 'reports':
        window.location.href = '/reports';
        break;
      case 'maintenance':
        window.location.href = '/maintenance';
        break;
    }
  }, []);

  const handleSelectStudent = useCallback((student: {
    firstName: string;
    lastName: string;
    studentId: string;
    email: string;
  }) => {
    setSelectedStudent(student);
    // Focus the chromebook search after student selection
    setTimeout(() => {
      chromebookSelectionRef.current?.focusSearch();
    }, 100);
  }, []);

  const handleSelectChromebook = useCallback((chromebook: Chromebook | null) => {
    setSelectedChromebook(chromebook);
    // Auto-open modal when chromebook is selected and student is already selected
    if (chromebook && selectedStudent) {
      // Add a small delay to prevent Enter key from carrying over to the modal
      setTimeout(() => {
        setIsCheckoutModalOpen(true);
      }, 100);
    }
  }, [selectedStudent]);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50/80 dark:bg-black/80 transition-colors duration-300">
        <Header />
        <div className="flex">
          <Sidebar
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            userRole={user?.role === 'super_admin' ? 'super-admin' :
                     user?.role === 'admin' ? 'admin' :
                     'user'}
          />
          <main className="flex-1 p-8">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Check Out Chromebook
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Assign a Chromebook to a student and record the checkout information
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <CheckoutStudentSearch
                    onSelectStudent={handleSelectStudent}
                    selectedStudent={selectedStudent}
                  />
                </div>
                <div className="lg:col-span-2 space-y-6">
                  <ChromebookSelection
                    ref={chromebookSelectionRef}
                    onSelectChromebook={handleSelectChromebook}
                    selectedChromebook={selectedChromebook}
                  />

                </div>
              </div>
            </div>

            {/* Floating Continue to Checkout Button */}
            {selectedStudent && selectedChromebook && (
              <Button
                onClick={() => setIsCheckoutModalOpen(true)}
                className="fixed bottom-6 right-6 h-14 px-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 z-50"
                size="lg"
              >
                <ShoppingCart className="mr-2 h-5 w-5" />
                Continue to Checkout
              </Button>
            )}

            {/* Checkout Modal */}
            <Dialog open={isCheckoutModalOpen} onOpenChange={setIsCheckoutModalOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Complete Checkout</DialogTitle>
                </DialogHeader>
                {selectedStudent && selectedChromebook && (
                  <CheckoutWorkflow
                    key={`${selectedChromebook.id}-${isCheckoutModalOpen}`}
                    student={selectedStudent}
                    chromebook={selectedChromebook}
                  />
                )}
              </DialogContent>
            </Dialog>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default CheckoutPage;
