import React, { useState, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Eye, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Device detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;

// PDF.js configuration
if (isIOS) {
  console.log('📱 iOS detected - using legacy PDF.js configuration');
  pdfjs.GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
} else {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface LastResortPDFViewerProps {
  file: string | null;
  documentTitle?: string;
  documentType?: string;
}

// Utility function to extract name from filename
const extractNameFromFilename = (filename: string): string => {
  if (!filename) return "";

  try {
    // Remove .pdf extension and split by underscores
    const parts = filename.replace('.pdf', '').split('_');

    // Pattern: date_time_serial_firstName_lastName_studentId
    if (parts.length >= 6) {
      const firstName = parts[3];
      const lastName = parts[4];

      // Convert to title case
      const toTitleCase = (str: string) =>
        str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

      return `${toTitleCase(firstName)} ${toTitleCase(lastName)}`;
    }
  } catch (error) {
    console.warn('Failed to extract name from filename:', filename, error);
  }

  return "";
};

const LastResortPDFViewer: React.FC<LastResortPDFViewerProps> = ({
  file,
  documentTitle = "Document",
  documentType = "Agreement"
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  // Extract user name from filename and use as display title
  const displayTitle = useMemo(() => {
    if (file) {
      const filename = file.split('/').pop() || '';
      const extractedName = extractNameFromFilename(filename);
      return extractedName || documentTitle;
    }
    return documentTitle;
  }, [file, documentTitle]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    console.log('✅ PDF loaded successfully with', numPages, 'pages');
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('❌ PDF.js failed:', error);
    setIsLoading(false);
    setError(error.message);

    if (isIOS) {
      console.log('📱 Switching to native iOS fallback');
      setShowFallback(true);
    }
  }, []);

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(numPages, prev + 1));
  };

  const openInNewTab = () => {
    if (file) {
      window.open(file, '_blank');
    }
  };

  const downloadPDF = () => {
    if (file) {
      const link = document.createElement('a');
      link.href = file;
      link.download = `${documentTitle.toLowerCase().replace(/\s+/g, '-')}.pdf`;
      link.click();
    }
  };

  // Enhanced fallback UI - default for mobile devices
  if (isMobile || showFallback || (isIOS && error)) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-6 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="w-full max-w-lg mx-auto">
          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{displayTitle}</h2>
                  <p className="text-blue-100 text-sm">Device Agreement</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  onClick={openInNewTab}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-3"
                >
                  <ExternalLink className="w-5 h-5" />
                  View {documentType}
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={downloadPDF}
                    variant="outline"
                    className="h-11 rounded-xl border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>

                  <Button
                    onClick={() => {
                      if (navigator.share && file) {
                        navigator.share({
                          title: documentTitle,
                          url: file
                        }).catch(console.error);
                      } else {
                        // Fallback to copying URL
                        if (file) {
                          navigator.clipboard?.writeText(file);
                        }
                      }
                    }}
                    variant="outline"
                    className="h-11 rounded-xl border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading PDF...</p>
          <p className="text-sm text-slate-500 mt-1">Please wait while we prepare your document</p>
        </div>
      </div>
    );
  }

  if (error && !showFallback) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center space-y-4">
          <div className="bg-red-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6 text-red-600" />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-red-800 mb-2">PDF Loading Failed</h3>
            <p className="text-red-600 text-sm mb-4">{error}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button
              onClick={openInNewTab}
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-wrapper">
      {/* Toolbar */}
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-section">
          <span className="pdf-toolbar-title">Document</span>
          {numPages > 0 && (
            <span className="pdf-page-info">
              Page {pageNumber} of {numPages}
            </span>
          )}
        </div>

        <div className="pdf-toolbar-section">
          {/* Navigation */}
          {numPages > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevPage}
                disabled={pageNumber <= 1}
                className="pdf-toolbar-button"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextPage}
                disabled={pageNumber >= numPages}
                className="pdf-toolbar-button"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Actions */}
          <Button
            variant="ghost"
            size="icon"
            onClick={openInNewTab}
            className="pdf-toolbar-button"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={downloadPDF}
            className="pdf-toolbar-button"
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="pdf-document-container">
        {isLoading && (
          <div className="pdf-loading-overlay">
            <div className="text-center">
              <div className="pdf-loading-spinner"></div>
              <p className="pdf-loading-text">Loading PDF...</p>
            </div>
          </div>
        )}

        <div className="pdf-document-wrapper">
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading=""
            error=""
            options={{
              cMapUrl: '//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
              cMapPacked: true,
              standardFontDataUrl: '//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/standard_fonts/',
              ...(isIOS && {
                disableWorker: false,
                disableAutoFetch: false,
                disableStream: true,
                disableFontFace: false,
                useSystemFonts: true,
                isEvalSupported: true,
                maxImageSize: 512 * 512,
                verbosity: 1
              }),
              ...(!isIOS && {
                disableAutoFetch: true,
                disableStream: true,
                disableFontFace: true,
                useSystemFonts: false,
                isEvalSupported: false,
                maxImageSize: 1024 * 1024,
                verbosity: 0
              })
            }}
          >
            <Page
              pageNumber={pageNumber}
              scale={1.0}
              width={Math.min(window.innerWidth - 64, 800)}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="pdf-page"
            />
          </Document>
        </div>
      </div>

      {/* Mobile Navigation Footer */}
      {isIOS && numPages > 1 && (
        <div className="pdf-mobile-nav">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <span className="pdf-mobile-page-info">
            {pageNumber} / {numPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            className="flex items-center gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default LastResortPDFViewer;