import React, { useCallback, useState } from 'react';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PhotoUploadProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  maxPhotos?: number;
}

export const PhotoUpload: React.FC<PhotoUploadProps> = ({
  photos,
  onPhotosChange,
  maxPhotos = 10,
}) => {
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files).filter(file => {
      // Only allow image files
      return file.type.startsWith('image/');
    });

    // Limit total photos
    const remainingSlots = maxPhotos - photos.length;
    const filesToAdd = newFiles.slice(0, remainingSlots);

    if (filesToAdd.length > 0) {
      onPhotosChange([...photos, ...filesToAdd]);
    }
  }, [photos, onPhotosChange, maxPhotos]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const removePhoto = useCallback((index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
  }, [photos, onPhotosChange]);

  const createImagePreview = (file: File): string => {
    return URL.createObjectURL(file);
  };

  return (
    <Card className="border-2 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center text-base">
          <Camera className="mr-2 h-5 w-5 text-blue-500" />
          Photo Documentation ({photos.length}/{maxPhotos})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        {photos.length < maxPhotos && (
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-6 text-center transition-colors",
              dragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="space-y-2">
              <div className="flex justify-center">
                <Upload className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Drop photos here or click to upload
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  PNG, JPG, GIF up to 10MB each
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Photo Grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img
                    src={createImagePreview(photo)}
                    alt={`Damage photo ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removePhoto(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
                <div className="absolute bottom-2 left-2 right-2">
                  <div className="bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded truncate">
                    {photo.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Photo Count Info */}
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {photos.length === 0
              ? "No photos uploaded"
              : `${photos.length} photo${photos.length === 1 ? '' : 's'} uploaded`
            }
          </span>
          {photos.length >= maxPhotos && (
            <span className="text-orange-500">Maximum photos reached</span>
          )}
        </div>

        {/* Camera Button for Mobile */}
        <div className="md:hidden">
          <Button
            variant="outline"
            className="w-full flex items-center justify-center space-x-2"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.capture = 'environment'; // Use rear camera
              input.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.files) {
                  handleFiles(target.files);
                }
              };
              input.click();
            }}
          >
            <Camera className="h-4 w-4" />
            <span>Take Photo</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
