import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/hooks/use-toast';
import { Chromebook } from '@/types/chromebook';
import { DamageAssessment } from '../Checkin/DamageAssessment';
import { DamageLocation } from '../Checkin/CheckinWorkflow';

const maintenanceFormSchema = z.object({
  condition: z.enum(['good', 'damaged', 'requires_repair']),
  damageLocations: z.array(z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    area: z.string(),
    damageType: z.string(),
    severity: z.enum(['minor', 'major', 'critical']),
    description: z.string().optional(),
  })).optional(),
  totalCost: z.number().optional(),
});

type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

interface MaintenanceDamageAssessmentProps {
  chromebook: Chromebook;
  isInsured: boolean;
  onComplete: (data: { damageLocations: DamageLocation[]; totalCost: number }) => void;
}

export const MaintenanceDamageAssessment: React.FC<MaintenanceDamageAssessmentProps> = ({
  chromebook,
  isInsured,
  onComplete,
}) => {
  const [damageLocations, setDamageLocations] = useState<DamageLocation[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<File[]>([]);

  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: {
      condition: 'good',
      damageLocations: [],
      totalCost: 0,
    },
  });

  // Create a modified chromebook object with the insurance status
  const assessmentChromebook = {
    ...chromebook,
    isInsured,
  };

  // Watch for form changes
  const watchedTotalCost = form.watch('totalCost');

  // Automatically update parent whenever damage locations or total cost changes
  useEffect(() => {
    const totalCost = watchedTotalCost || 0;
    console.log('MaintenanceDamageAssessment: Data changed', { damageLocations, totalCost });
    onComplete({
      damageLocations,
      totalCost,
    });
  }, [damageLocations, watchedTotalCost, onComplete]);

  const handleComplete = () => {
    const totalCost = form.watch('totalCost') || 0;
    onComplete({
      damageLocations,
      totalCost,
    });
  };

  const handleDamageLocationsChange = (newDamageLocations: DamageLocation[]) => {
    console.log('MaintenanceDamageAssessment: Damage locations updated', newDamageLocations);
    setDamageLocations(newDamageLocations);
  };

  return (
    <div className="w-full">
      <DamageAssessment
        chromebook={assessmentChromebook}
        damageLocations={damageLocations}
        onDamageLocationsChange={handleDamageLocationsChange}
        uploadedPhotos={uploadedPhotos}
        onPhotosChange={setUploadedPhotos}
        form={form}
        onNext={handleComplete}
        onPrevious={() => {}} // No previous step in maintenance context
        isInsured={isInsured}
      />
    </div>
  );
};
