import React, { useState, useCallback, useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Camera, Upload, X, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle, Plus, DollarSign } from 'lucide-react';
import { feeAndCostConfig } from '@/config';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Chromebook } from '@/types/chromebook';
import { DamageLocation } from './CheckinWorkflow';

// Import the photo upload component
import { PhotoUpload } from './PhotoUpload';

interface DamageAssessmentProps {
  chromebook: Chromebook;
  damageLocations: DamageLocation[];
  onDamageLocationsChange: (locations: DamageLocation[]) => void;
  uploadedPhotos: File[];
  onPhotosChange: (photos: File[]) => void;
  form: UseFormReturn<any>;
  onNext: () => void;
  onPrevious: () => void;
  isInsured: boolean;
}

export const DamageAssessment: React.FC<DamageAssessmentProps> = ({
  chromebook,
  damageLocations,
  onDamageLocationsChange,
  uploadedPhotos,
  onPhotosChange,
  form,
  onNext,
  onPrevious,
  isInsured,
}) => {
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [showDamageForm, setShowDamageForm] = useState(false);
  const [tempMarker, setTempMarker] = useState<{ x: number; y: number; area: string } | null>(null);

  const condition = form.watch('condition');
  const chargerReturned = form.watch('chargerReturned');
  const waiveCost = form.watch('waiveCost');
  const totalCost = form.watch('totalCost');

  useEffect(() => {
    let cost = 0;
    if (waiveCost) {
      form.setValue('totalCost', 0);
      return;
    }

    if (isInsured) {
      if (!chargerReturned) {
        cost += feeAndCostConfig.replacementCharger;
      }
      form.setValue('totalCost', cost);
      return;
    }

    if (!chargerReturned) {
      cost += feeAndCostConfig.replacementCharger;
    }

    const damagedAreas = new Set(damageLocations.map(d => d.area));
    if (damagedAreas.has('Keyboard')) {
      cost += feeAndCostConfig.replacementKeyboard;
    }
    if (damagedAreas.has('Screen')) {
      cost += feeAndCostConfig.replacementScreen;
    }

    if (condition === 'requires_repair') {
        const hasScreenOrKeyboardDamage = damagedAreas.has('Screen') || damagedAreas.has('Keyboard');
        if (!hasScreenOrKeyboardDamage) {
            cost += feeAndCostConfig.replacementDevice;
        }
    }

    form.setValue('totalCost', cost);
  }, [damageLocations, isInsured, condition, chargerReturned, waiveCost, form]);

  const handleLaptopClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const target = event.target as SVGElement;
    const area = target.dataset.area;

    if (area) {
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const svgPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      setTempMarker({ x: svgPoint.x, y: svgPoint.y, area });
      setShowDamageForm(true);
    }
  };

  const addDamageLocation = (damageType: string, severity: 'minor' | 'major' | 'critical', description?: string) => {
    if (!tempMarker) return;

    const newDamage: DamageLocation = {
      id: `damage-${Date.now()}`,
      x: tempMarker.x,
      y: tempMarker.y,
      area: tempMarker.area,
      damageType: `${tempMarker.area} is ${damageType.toLowerCase()}`,
      severity,
      description,
    };

    onDamageLocationsChange([...damageLocations, newDamage]);
    setTempMarker(null);
    setShowDamageForm(false);

    // Update form condition if not already set
    if (!condition || condition === 'good') {
      form.setValue('condition', severity === 'critical' ? 'requires_repair' : 'damaged');
    }
  };

  const removeDamageLocation = (id: string) => {
    const updatedLocations = damageLocations.filter(loc => loc.id !== id);
    onDamageLocationsChange(updatedLocations);

    // If no damage locations left, reset condition to good
    if (updatedLocations.length === 0) {
      form.setValue('condition', 'good');
    }
  };

  const getSeverityColor = (severity: 'minor' | 'major' | 'critical') => {
    switch (severity) {
      case 'minor': return '#fbbf24'; // yellow
      case 'major': return '#f97316'; // orange
      case 'critical': return '#ef4444'; // red
      default: return '#6b7280'; // gray
    }
  };

  const canProceed = condition !== undefined;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Condition Assessment
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Assess the device condition and mark any damage locations
        </p>
      </div>

      <Form {...form}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Interactive Damage Mapping */}
          <Card className="border-2 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center text-base">
                <AlertTriangle className="mr-2 h-5 w-5 text-orange-500" />
                Interactive Damage Mapping
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Click on areas of the device to mark damage locations
                </p>

                {/* SVG Laptop Diagram */}
                <div className="flex justify-center">
                <svg
                  width="500"
                  height="350"
                  viewBox="0 0 500 350"
                  className="border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-800"
                  onClick={handleLaptopClick}
                >
                  {/* Laptop Body */}
                  <rect x="80" y="180" width="350" height="180" rx="10" fill="#444" stroke="#6b7280" strokeWidth="1" data-area="Bottom Case" />

                  {/* Keyboard Area */}
                  <rect x="133" y="205" width="245" height="75" fill="#848484" rx="5" data-area="Keyboard" />

                  {/* Trackpad */}
                  <rect x="200" y="295" width="100" height="50" fill="#848484" rx="3" data-area="Trackpad" />

                  {/* Screen Area */}
                  <rect x="85" y="-5" width="340" height="190" rx="10" fill="#444" data-area="Screen Bezel" />
                  <rect x="115" y="17" width="280" height="130" fill="#000" data-area="Screen" />

                  {/* Hinge */}
                  <rect x="85" y="170" width="340" height="15" fill="#777" data-area="Hinge" />

                  {/* Ports */}
                  <rect x="65" y="210" width="15" height="20" fill="#9ca3af" rx="1" data-area="Left Port 1" />
                  <rect x="65" y="250" width="15" height="20" fill="#9ca3af" rx="1" data-area="Left Port 2" />
                  <rect x="430" y="210" width="15" height="20" fill="#9ca3af" rx="1" data-area="Right Port 1" />
                  <rect x="430" y="250" width="15" height="20" fill="#9ca3af" rx="1" data-area="Right Port 2" />

                  {/* Damage Markers */}
                  {damageLocations.map((damage) => (
                    <g key={damage.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedMarker(damage.id); }}>
                      <circle
                        cx={damage.x}
                        cy={damage.y}
                        r="5"
                        fill={getSeverityColor(damage.severity)}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text
                        x={damage.x}
                        y={damage.y + 1.5}
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        className="text-xs fill-white font-bold pointer-events-none"
                      >
                        !
                      </text>
                    </g>
                  ))}

                  {/* Temporary marker */}
                  {tempMarker && (
                    <circle
                      cx={tempMarker.x}
                      cy={tempMarker.y}
                      r="5"
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      className="animate-pulse"
                    />
                  )}
                </svg>
                </div>

                {/* Legend */}
                <div className="flex justify-center space-x-4 text-xs">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-yellow-400 mr-1"></div>
                    <span>Minor</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-orange-500 mr-1"></div>
                    <span>Major</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-red-500 mr-1"></div>
                    <span>Critical</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Condition Selection and Damage List */}
          <div className="space-y-6">
            {/* Overall Condition */}
            <Card className="border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
                  Overall Condition
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Condition</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select condition" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="good">
                            <div className="flex items-center">
                              <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                              <span>Good condition</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="damaged">
                            <div className="flex items-center">
                              <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" />
                              <span>Damaged</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="requires_repair">
                            <div className="flex items-center">
                              <AlertTriangle className="w-4 h-4 mr-2 text-red-500" />
                              <span>Requires repair</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="chargerReturned"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Charger Returned
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Damage Locations List */}
            {damageLocations.length > 0 && (
              <Card className="border-2 border-orange-200 dark:border-orange-800">
                <CardHeader>
                  <CardTitle className="flex items-center text-base">
                    <AlertTriangle className="mr-2 h-5 w-5 text-orange-500" />
                    Identified Damage ({damageLocations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {damageLocations.map((damage) => (
                      <div
                        key={damage.id}
                        className={cn(
                          "p-3 border rounded-lg",
                          selectedMarker === damage.id
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                            : "border-gray-200 dark:border-gray-700"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-white",
                                  damage.severity === 'minor' && "bg-yellow-500",
                                  damage.severity === 'major' && "bg-orange-500",
                                  damage.severity === 'critical' && "bg-red-500"
                                )}
                              >
                                {damage.severity}
                              </Badge>
                              <span className="font-medium text-sm">{damage.damageType}</span>
                            </div>
                            {damage.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                {damage.description}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeDamageLocation(damage.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cost Calculation */}
            <Card className="border-2 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <DollarSign className="mr-2 h-5 w-5 text-blue-500" />
                  Cost Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Insurance Status:</span>
                    <Badge variant={isInsured ? "secondary" : "destructive"}>
                      {isInsured ? "Covered" : "Not Covered"}
                    </Badge>
                  </div>
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total Cost:</span>
                    <span>${totalCost.toFixed(2)}</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="waiveCost"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Waive Repair Cost
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Photo Upload */}
            <PhotoUpload
              photos={uploadedPhotos}
              onPhotosChange={onPhotosChange}
              maxPhotos={10}
            />
          </div>
        </div>
      </Form>

      {/* Damage Form Modal */}
      {showDamageForm && tempMarker && (
        <DamageForm
          area={tempMarker.area}
          onSubmit={addDamageLocation}
          onCancel={() => {
            setTempMarker(null);
            setShowDamageForm(false);
          }}
        />
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-6">
        <Button
          variant="outline"
          size="lg"
          onClick={onPrevious}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Verification</span>
        </Button>
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center space-x-2"
        >
          <span>Continue to Processing</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

// Damage Form Component
interface DamageFormProps {
  area: string;
  onSubmit: (damageType: string, severity: 'minor' | 'major' | 'critical', description?: string) => void;
  onCancel: () => void;
}

const DamageForm: React.FC<DamageFormProps> = ({ area, onSubmit, onCancel }) => {
  const [damageType, setDamageType] = useState('');
  const [severity, setSeverity] = useState<'minor' | 'major' | 'critical'>('minor');
  const [description, setDescription] = useState('');

  const damageTypes = [
    'Cracked',
    'Dented',
    'Scratched',
    'Missing piece',
    'Not working',
    'Loose/wobbly',
    'Stain/discoloration',
  ];

  const handleSubmit = () => {
    if (damageType) {
      onSubmit(damageType, severity, description || undefined);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Add Damage: {area}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Damage Type</label>
            <Select value={damageType} onValueChange={setDamageType}>
              <SelectTrigger>
                <SelectValue placeholder="Select damage type" />
              </SelectTrigger>
              <SelectContent>
                {damageTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Severity</label>
            <Select value={severity} onValueChange={(value: 'minor' | 'major' | 'critical') => setSeverity(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">Minor - Cosmetic damage</SelectItem>
                <SelectItem value="major">Major - Affects functionality</SelectItem>
                <SelectItem value="critical">Critical - Device unusable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Description (Optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details about the damage..."
              className="mt-1"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!damageType}>
              Add Damage
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
