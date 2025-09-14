import fs from 'fs/promises';
import path from 'path';
import { PhotoService } from '../services/photoService';

const PHOTO_DIR = path.join(process.cwd(), 'files/photos');

interface OptimizationStats {
    totalFiles: number;
    optimized: number;
    failed: number;
    originalSize: number;
    optimizedSize: number;
    spaceSaved: number;
}

/**
 * Utility to optimize all existing photos in the storage directory.
 * This will help reduce storage usage for photos that were uploaded before optimization was implemented.
 */
export class PhotoOptimizer {
    private stats: OptimizationStats = {
        totalFiles: 0,
        optimized: 0,
        failed: 0,
        originalSize: 0,
        optimizedSize: 0,
        spaceSaved: 0,
    };

    /**
     * Recursively finds all image files in the photos directory
     */
    private async findImageFiles(dir: string): Promise<string[]> {
        const imageFiles: string[] = [];

        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Recursively search subdirectories
                    const subFiles = await this.findImageFiles(fullPath);
                    imageFiles.push(...subFiles);
                } else if (entry.isFile()) {
                    // Check if it's an image file that needs optimization
                    const ext = path.extname(entry.name).toLowerCase();
                    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'].includes(ext)) {
                        // Skip if already optimized (webp files)
                        if (ext !== '.webp') {
                            imageFiles.push(fullPath);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error reading directory ${dir}:`, error);
        }

        return imageFiles;
    }

    /**
     * Optimizes a single image file
     */
    private async optimizeImage(filePath: string): Promise<boolean> {
        try {
            // Get original file stats
            const originalStats = await fs.stat(filePath);
            this.stats.originalSize += originalStats.size;

            // Generate optimized filename (same location, .webp extension)
            const dir = path.dirname(filePath);
            const basename = path.basename(filePath, path.extname(filePath));
            const optimizedPath = path.join(dir, `${basename}_optimized.webp`);

            // Optimize the image using PhotoService
            const success = await PhotoService.optimizeExistingImage(filePath, optimizedPath);

            if (success) {
                // Get optimized file stats
                const optimizedStats = await fs.stat(optimizedPath);
                this.stats.optimizedSize += optimizedStats.size;
                this.stats.spaceSaved += (originalStats.size - optimizedStats.size);

                // Replace original with optimized version
                await fs.unlink(filePath); // Delete original
                const finalPath = path.join(dir, `${basename}.webp`);
                await fs.rename(optimizedPath, finalPath); // Rename optimized file

                this.stats.optimized++;
                return true;
            } else {
                this.stats.failed++;
                return false;
            }
        } catch (error) {
            console.error(`❌ Error optimizing ${filePath}:`, error);
            this.stats.failed++;
            return false;
        }
    }

    /**
     * Optimizes all photos in the storage directory
     */
    async optimizeAllPhotos(dryRun: boolean = false): Promise<OptimizationStats> {
        console.log(`🚀 [PhotoOptimizer] Starting ${dryRun ? 'DRY RUN' : 'optimization'} of existing photos...`);

        // Reset stats
        this.stats = {
            totalFiles: 0,
            optimized: 0,
            failed: 0,
            originalSize: 0,
            optimizedSize: 0,
            spaceSaved: 0,
        };

        try {
            // Check if photos directory exists
            await fs.access(PHOTO_DIR);
        } catch (error) {
            console.log(`📁 [PhotoOptimizer] Photos directory not found: ${PHOTO_DIR}`);
            return this.stats;
        }

        // Find all image files
        console.log(`🔍 [PhotoOptimizer] Scanning for images in ${PHOTO_DIR}...`);
        const imageFiles = await this.findImageFiles(PHOTO_DIR);
        this.stats.totalFiles = imageFiles.length;

        console.log(`📊 [PhotoOptimizer] Found ${imageFiles.length} images to optimize`);

        if (dryRun) {
            console.log(`📋 [PhotoOptimizer] DRY RUN - Files that would be optimized:`);
            imageFiles.forEach((file, index) => {
                console.log(`   ${index + 1}. ${file}`);
            });
            return this.stats;
        }

        // Process each image
        for (let i = 0; i < imageFiles.length; i++) {
            const filePath = imageFiles[i];
            console.log(`📸 [PhotoOptimizer] Processing ${i + 1}/${imageFiles.length}: ${path.basename(filePath)}`);

            await this.optimizeImage(filePath);

            // Show progress every 10 files
            if ((i + 1) % 10 === 0) {
                const progress = ((i + 1) / imageFiles.length * 100).toFixed(1);
                console.log(`📈 [PhotoOptimizer] Progress: ${progress}% (${i + 1}/${imageFiles.length})`);
            }
        }

        // Print final statistics
        this.printStats();

        return this.stats;
    }

    /**
     * Prints optimization statistics
     */
    private printStats(): void {
        console.log(`\n📊 [PhotoOptimizer] Optimization Complete!`);
        console.log(`   Total files found: ${this.stats.totalFiles}`);
        console.log(`   Successfully optimized: ${this.stats.optimized}`);
        console.log(`   Failed: ${this.stats.failed}`);

        if (this.stats.optimized > 0) {
            const originalSizeMB = (this.stats.originalSize / (1024 * 1024)).toFixed(2);
            const optimizedSizeMB = (this.stats.optimizedSize / (1024 * 1024)).toFixed(2);
            const spaceSavedMB = (this.stats.spaceSaved / (1024 * 1024)).toFixed(2);
            const compressionRatio = ((this.stats.spaceSaved / this.stats.originalSize) * 100).toFixed(1);

            console.log(`   Original total size: ${originalSizeMB} MB`);
            console.log(`   Optimized total size: ${optimizedSizeMB} MB`);
            console.log(`   Space saved: ${spaceSavedMB} MB (${compressionRatio}% reduction)`);
        }
    }
}

/**
 * CLI script to run photo optimization
 */
async function runOptimization() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');

    const optimizer = new PhotoOptimizer();

    if (dryRun) {
        console.log(`🔍 [PhotoOptimizer] Running in DRY RUN mode - no files will be modified`);
    } else {
        console.log(`⚠️  [PhotoOptimizer] This will modify existing files. Make sure you have backups!`);
    }

    await optimizer.optimizeAllPhotos(dryRun);
}

// Run if called directly
if (require.main === module) {
    runOptimization().catch(console.error);
}
