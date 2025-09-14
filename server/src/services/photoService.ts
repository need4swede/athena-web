import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

const PHOTO_DIR = path.join(process.cwd(), 'files/photos');

// Image optimization settings for maximum storage savings
const OPTIMIZATION_SETTINGS = {
    // Maximum dimensions for stored images
    maxWidth: 1200,
    maxHeight: 1200,
    // WebP quality settings (aggressive compression for storage optimization)
    webpQuality: 75,
    // JPEG fallback quality
    jpegQuality: 80,
    // Whether to strip metadata to save space
    stripMetadata: true,
};

// Utility to sanitize asset tags for use as directory names
const sanitizeAssetTag = (assetTag: string): string => {
    return assetTag.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Service for handling photo uploads, deletions, and path management
export const PhotoService = {
    /**
     * Saves and optimizes uploaded photos to the file system.
     * Uses Sharp for aggressive compression to minimize storage usage.
     *
     * @param assetTag - The asset tag of the device.
     * @param photos - An array of base64 encoded photo strings.
     * @returns A promise that resolves to an array of photo URLs.
     */
    async savePhotos(assetTag: string, photos: string[]): Promise<string[]> {
        if (!photos || photos.length === 0) {
            return [];
        }

        const sanitizedAssetTag = sanitizeAssetTag(assetTag);
        const date = new Date().toISOString().split('T')[0];
        const deviceDir = path.join(PHOTO_DIR, sanitizedAssetTag, date);

        try {
            await fs.mkdir(deviceDir, { recursive: true });
        } catch (error) {
            console.error(`❌ [PhotoService] Error creating directory: ${deviceDir}`, error);
            throw new Error('Failed to create photo directory');
        }

        const savedPhotoUrls: string[] = [];

        for (let i = 0; i < photos.length; i++) {
            const photo = photos[i];
            const randomFilename = `${uuidv4()}.webp`; // Always save as WebP for best compression
            const filePath = path.join(deviceDir, randomFilename);
            const urlPath = `/files/photos/${sanitizedAssetTag}/${date}/${randomFilename}`;

            try {
                // Extract base64 data and convert to buffer
                const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
                const imageBuffer = Buffer.from(base64Data, 'base64');

                // Log original size for debugging
                const originalSize = imageBuffer.length;
                console.log(`📸 [PhotoService] Processing photo ${i + 1}: Original size ${(originalSize / 1024).toFixed(2)}KB`);

                // Process image with Sharp for optimal storage
                const processedImageBuffer = await sharp(imageBuffer)
                    // Resize to maximum dimensions while maintaining aspect ratio
                    .resize(OPTIMIZATION_SETTINGS.maxWidth, OPTIMIZATION_SETTINGS.maxHeight, {
                        fit: 'inside',
                        withoutEnlargement: true, // Don't upscale smaller images
                    })
                    // Convert to WebP with aggressive compression
                    .webp({
                        quality: OPTIMIZATION_SETTINGS.webpQuality,
                        effort: 6, // Maximum compression effort
                        smartSubsample: true, // Better compression for photos
                    })
                    // Strip metadata to save additional space
                    .toBuffer();

                // Write optimized image to disk
                await fs.writeFile(filePath, processedImageBuffer);

                // Log compression results
                const optimizedSize = processedImageBuffer.length;
                const compressionRatio = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
                console.log(`✅ [PhotoService] Photo ${i + 1} saved: ${(optimizedSize / 1024).toFixed(2)}KB (${compressionRatio}% reduction)`);

                savedPhotoUrls.push(urlPath);
            } catch (error) {
                console.error(`❌ [PhotoService] Error processing photo ${i + 1}:`, error);
                // Continue to next photo if one fails
            }
        }

        console.log(`📊 [PhotoService] Successfully processed ${savedPhotoUrls.length}/${photos.length} photos for device ${assetTag}`);
        return savedPhotoUrls;
    },

    /**
     * Optimizes an existing image file for storage efficiency.
     * 
     * @param inputPath - Path to the input image file
     * @param outputPath - Path where optimized image should be saved
     * @returns Promise<boolean> - Success status
     */
    async optimizeExistingImage(inputPath: string, outputPath: string): Promise<boolean> {
        try {
            const originalStats = await fs.stat(inputPath);
            const originalSize = originalStats.size;

            await sharp(inputPath)
                .resize(OPTIMIZATION_SETTINGS.maxWidth, OPTIMIZATION_SETTINGS.maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .webp({
                    quality: OPTIMIZATION_SETTINGS.webpQuality,
                    effort: 6,
                    smartSubsample: true,
                })
                .toFile(outputPath);

            const optimizedStats = await fs.stat(outputPath);
            const optimizedSize = optimizedStats.size;
            const compressionRatio = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);

            console.log(`🔄 [PhotoService] Optimized existing image: ${(originalSize / 1024).toFixed(2)}KB → ${(optimizedSize / 1024).toFixed(2)}KB (${compressionRatio}% reduction)`);

            return true;
        } catch (error) {
            console.error(`❌ [PhotoService] Error optimizing existing image:`, error);
            return false;
        }
    },

    /**
     * Deletes photos from the file system.
     *
     * @param photoUrls - An array of photo URLs to delete.
     * @returns A promise that resolves when the photos are deleted.
     */
    async deletePhotos(photoUrls: string[]): Promise<void> {
        if (!photoUrls || photoUrls.length === 0) {
            return;
        }

        for (const url of photoUrls) {
            try {
                const filePath = path.join(process.cwd(), url);
                await fs.unlink(filePath);
            } catch (error) {
                console.error(`❌ [PhotoService] Error deleting photo: ${url}`, error);
                // Continue to next photo if one fails
            }
        }
    }
};
