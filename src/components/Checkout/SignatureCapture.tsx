import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

interface SignatureCaptureProps {
  onChange?: (signature: string) => void;
}

export interface SignatureCaptureHandle {
  clear: () => void;
  getSignature: () => string | null;
}

export const SignatureCapture = forwardRef<SignatureCaptureHandle, SignatureCaptureProps>(
  ({ onChange }, ref) => {
    const sigCanvas = useRef<SignatureCanvas>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();

    const handleSignatureChange = () => {
      if (onChange && sigCanvas.current) {
        const signature = sigCanvas.current.getTrimmedCanvas().toDataURL();
        // Check if signature is not empty (more than just the empty canvas)
        const isEmpty = sigCanvas.current.isEmpty();
        onChange(isEmpty ? '' : signature);
      }
    };

    // Prevent drag and drop behavior
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const preventDragStart = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };

      const preventDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };

      const preventDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };

      const preventContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        return false;
      };

      const preventSelectStart = (e: Event) => {
        e.preventDefault();
        return false;
      };

      // Add event listeners to prevent drag behavior
      container.addEventListener('dragstart', preventDragStart);
      container.addEventListener('dragover', preventDragOver);
      container.addEventListener('drop', preventDrop);
      container.addEventListener('contextmenu', preventContextMenu);
      container.addEventListener('selectstart', preventSelectStart);

      // Also prevent on the canvas element specifically
      const canvas = container.querySelector('canvas');
      if (canvas) {
        canvas.addEventListener('dragstart', preventDragStart);
        canvas.addEventListener('dragover', preventDragOver);
        canvas.addEventListener('drop', preventDrop);
        canvas.addEventListener('contextmenu', preventContextMenu);
        canvas.addEventListener('selectstart', preventSelectStart);

        // Set draggable attribute to false
        canvas.draggable = false;
        canvas.setAttribute('draggable', 'false');
      }

      // Cleanup
      return () => {
        container.removeEventListener('dragstart', preventDragStart);
        container.removeEventListener('dragover', preventDragOver);
        container.removeEventListener('drop', preventDrop);
        container.removeEventListener('contextmenu', preventContextMenu);
        container.removeEventListener('selectstart', preventSelectStart);

        if (canvas) {
          canvas.removeEventListener('dragstart', preventDragStart);
          canvas.removeEventListener('dragover', preventDragOver);
          canvas.removeEventListener('drop', preventDrop);
          canvas.removeEventListener('contextmenu', preventContextMenu);
          canvas.removeEventListener('selectstart', preventSelectStart);
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      clear: () => {
        sigCanvas.current?.clear();
        if (onChange) {
          onChange('');
        }
      },
      getSignature: () => {
        if (sigCanvas.current) {
          const originalCanvas = sigCanvas.current.getCanvas();

          // Create a new canvas with the same dimensions
          const newCanvas = document.createElement('canvas');
          newCanvas.width = originalCanvas.width;
          newCanvas.height = originalCanvas.height;
          const newCtx = newCanvas.getContext('2d');

          if (newCtx) {
            // Fill with white background
            newCtx.fillStyle = 'white';
            newCtx.fillRect(0, 0, newCanvas.width, newCanvas.height);

            // If in dark mode, we need to convert white strokes to black
            if (theme === 'dark') {
              // Get the image data from the original canvas
              const originalCtx = originalCanvas.getContext('2d');
              if (originalCtx) {
                const imageData = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
                const data = imageData.data;

                // Create a new image data for the converted signature
                const newImageData = newCtx.createImageData(imageData.width, imageData.height);
                const newData = newImageData.data;

                // Convert white/light pixels to black, keep transparent pixels transparent
                for (let i = 0; i < data.length; i += 4) {
                  const r = data[i];
                  const g = data[i + 1];
                  const b = data[i + 2];
                  const a = data[i + 3];

                  // If pixel is not transparent and is light (white in dark mode)
                  if (a > 0 && (r > 200 || g > 200 || b > 200)) {
                    // Make it black
                    newData[i] = 0;       // R
                    newData[i + 1] = 0;   // G
                    newData[i + 2] = 0;   // B
                    newData[i + 3] = a;   // Keep original alpha
                  } else {
                    // Keep original color
                    newData[i] = r;
                    newData[i + 1] = g;
                    newData[i + 2] = b;
                    newData[i + 3] = a;
                  }
                }

                // Put the converted image data on the new canvas
                newCtx.putImageData(newImageData, 0, 0);
              }
            } else {
              // In light mode, just copy the original canvas as-is
              newCtx.drawImage(originalCanvas, 0, 0);
            }

            // Return the new canvas as data URL
            return newCanvas.toDataURL();
          }
        }
        return null;
      },
    }));

    return (
      <div
        ref={containerRef}
        className="w-full h-full signature-capture-container"
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          touchAction: 'none',
          WebkitTouchCallout: 'none'
        } as React.CSSProperties}
      >
        <SignatureCanvas
          ref={sigCanvas}
          penColor={theme === 'dark' ? 'white' : 'black'}
          canvasProps={{
            className: 'sigCanvas w-full h-full',
            style: {
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              touchAction: 'none',
              WebkitTouchCallout: 'none'
            } as React.CSSProperties,
            draggable: false,
            onDragStart: (e: React.DragEvent) => {
              e.preventDefault();
              return false;
            }
          }}
          onEnd={handleSignatureChange}
          onBegin={handleSignatureChange}
        />
      </div>
    );
  }
);
