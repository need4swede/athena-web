export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Note {
  id: string;
  note: string;
  created_at: Date;
}

export interface RecentUser {
  type: string;
  email: string;
}

export interface LastKnownNetwork {
  ipAddress: string;
  wanIpAddress: string;
}

export interface ActiveTimeRange {
  date: string;
  activeTime: number;
}

export interface CpuStatusReport {
  reportTime: string;
  cpuTemperatureInfo: Array<{
    cpuTemperature: number;
    cpuLabel: string;
  }>;
  cpuUtilizationPercentageInfo: Array<{
    cpuUtilizationPercentage: number;
  }>;
}

export interface DiskVolumeReport {
  volumeInfo: Array<{
    volumeId: string;
    storageTotal: number;
    storageFree: number;
  }>;
}

export interface SystemRamFreeReport {
  reportTime: string;
  systemRamFreeInfo: Array<{
    availableRam: number;
  }>;
}

export interface Chromebook {
  id: string;
  assetTag: string;
  serialNumber: string;
  model: string;
  orgUnit: string;
  status: 'available' | 'checked-out' | 'maintenance' | 'lost' | 'damaged' | 'deprovisioned' | 'disabled' | 'pending' | 'pending_signature';
  statusSource?: 'google' | 'local';
  statusOverrideDate?: Date;
  lastKnownUser?: string;
  currentUser?: {
    id: number;
    firstName: string;
    lastName: string;
    studentId: string;
  };
  checkedOutDate?: Date;
  checkedInDate?: Date;
  isInsured: boolean;
  insurance_status?: 'uninsured' | 'pending' | 'insured';
  inService?: boolean;
  notes: Note[] | string; // Support both array of Note objects and simple string from Google API
  history: ChromebookHistoryEntry[];
  tags: Tag[];
  lastUpdated: Date;
  assignedLocation?: string;

  // Google Admin specific fields
  deviceId?: string;
  lastSync?: Date;
  platformVersion?: string;
  osVersion?: string;
  firmwareVersion?: string;
  macAddress?: string;
  lastKnownNetwork?: LastKnownNetwork[];

  // New fields from Google API
  annotatedUser?: string;
  annotatedAssetId?: string;
  recentUsers?: RecentUser[];
  orgUnitPath?: string;

  // Additional Google API fields
  bootMode?: string;
  lastEnrollmentTime?: string;
  supportEndDate?: string;
  orderNumber?: string;
  willAutoRenew?: boolean;
  meid?: string;
  etag?: string;
  activeTimeRanges?: ActiveTimeRange[];
  cpuStatusReports?: CpuStatusReport[];
  diskVolumeReports?: DiskVolumeReport[];
  systemRamTotal?: number;
  systemRamFreeReports?: SystemRamFreeReport[];

  // Computed field for most recent user
  mostRecentUser?: string;

  maintenanceHistory?: MaintenanceHistoryEntry[];
}

export interface MaintenanceHistoryEntry {
  id: number;
  issue: string;
  status: 'pending' | 'in-progress' | 'completed';
  reportedDate: Date;
  completedDate?: Date;
  reportedBy: string;
  photos?: string[];
  serviceType?: 'return' | 'service';
  originalStatus?: string;
  originalCheckoutInfo?: any;
  comments: Array<{
    text: string;
    author: string;
    date: Date;
  }>;
}

export interface ChromebookHistoryEntry {
  id: string;
  type: 'checkout' | 'checkin' | 'repair' | 'damage' | 'note' | 'transfer';
  timestamp: Date;
  user: string;
  details: string;
  performedBy: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin' | 'super-admin';
  lastLogin?: Date;
  isActive: boolean;
}

export interface CheckoutFormData {
  studentFirstName: string;
  studentLastName: string;
  studentId: string;
  expectedReturnDate?: Date;
  notes?: string;
}

export interface Checkout {
  id: number;
  chromebook: {
    id: number;
    assetTag: string;
    serialNumber: string;
    model: string;
    checkedOutDate: string;
    isInsured: boolean;
    insurance?: string; // Added insurance status field
  };
  student: {
    studentId: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  checkedOutBy: {
    name: string;
    email: string;
  };
}
