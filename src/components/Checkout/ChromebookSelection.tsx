import React, { useState, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { Search, Filter, Loader2, Cloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChromebooks } from '@/hooks/useChromebooks';
import { useUnifiedSearch } from '@/hooks/useUnifiedSearch';
import { Chromebook } from '@/types/chromebook';

// Utility function to format org unit path by removing "/Chromebooks" prefix
const formatOrgUnit = (orgUnit: string): string => {
  if (orgUnit.startsWith('/Chromebooks')) {
    const remaining = orgUnit.substring('/Chromebooks'.length);
    return remaining || '/';
  }
  return orgUnit;
};

interface ChromebookSelectionProps {
  selectedChromebook: Chromebook | null;
  onSelectChromebook: (chromebook: Chromebook) => void;
}

export interface ChromebookSelectionRef {
  focusSearch: () => void;
}

// Custom hook for debounced search (same as ChromebooksPage)
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export const ChromebookSelection = forwardRef<ChromebookSelectionRef, ChromebookSelectionProps>(({
  selectedChromebook,
  onSelectChromebook
}, ref) => {
  const { chromebooks, loading, error } = useChromebooks();
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Unified search for devices (checkout context)
  const {
    devices: searchDevices,
    loading: searchLoading,
    backgroundSyncing: searchSyncing,
    metadata: searchMetadata
  } = useUnifiedSearch(searchTerm, {
    context: 'chromebooks',
    limit: 100,
    debounceMs: 300
  });

  // Expose the focusSearch method to parent components
  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      searchInputRef.current?.focus();
    }
  }));

  // Debounce search term to prevent lag while typing (same as ChromebooksPage)
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Filter chromebooks combining local devices and search results
  const filteredChromebooks = useMemo(() => {
    let allChromebooks = chromebooks;

    // If there's a search term, merge with search results and deduplicate
    if (debouncedSearchTerm && debouncedSearchTerm.length >= 3) {
      // Create a Set of existing device serial numbers for deduplication
      const existingSerialNumbers = new Set(chromebooks.map(device => device.serialNumber));

      // Add unique search results that aren't already in local chromebooks
      const uniqueSearchDevices = searchDevices.filter(searchDevice =>
        !existingSerialNumbers.has(searchDevice.serialNumber)
      );

      allChromebooks = [...chromebooks, ...uniqueSearchDevices];
    }

    // Only show available chromebooks
    const availableChromebooks = allChromebooks.filter(chromebook => chromebook.status === 'available');

    if (!debouncedSearchTerm) {
      // Don't show any chromebooks when no search term
      return [];
    }

    const query = debouncedSearchTerm.toLowerCase();

    // Check if search query looks like an org unit path
    const isOrgUnitSearch = debouncedSearchTerm.startsWith('/') || debouncedSearchTerm.includes('OU=');

    return availableChromebooks.filter(chromebook => {
      if (isOrgUnitSearch) {
        // Search by org unit
        return chromebook.orgUnit && chromebook.orgUnit.toLowerCase().includes(query);
      } else {
        // Search by asset tag, serial number, model, or last known user
        return (
          chromebook.assetTag.toLowerCase().includes(query) ||
          chromebook.serialNumber.toLowerCase().includes(query) ||
          chromebook.model.toLowerCase().includes(query) ||
          (chromebook.lastKnownUser && chromebook.lastKnownUser.toLowerCase().includes(query))
        );
      }
    });
  }, [chromebooks, searchDevices, debouncedSearchTerm]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select Available Chromebook</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading available Chromebooks...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select Available Chromebook</CardTitle>
        </CardHeader>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-red-500 dark:text-red-400 mb-2">Error loading chromebooks</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Available Chromebook ({filteredChromebooks.length} available)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Input
              ref={searchInputRef}
              placeholder="Search by asset tag, serial, model, or org unit"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredChromebooks.length === 1) {
                  onSelectChromebook(filteredChromebooks[0]);
                }
              }}
              className="pr-8"
            />
            {(searchLoading || searchSyncing || searchTerm !== debouncedSearchTerm) ? (
              <div className="absolute right-2.5 top-2.5">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
              </div>
            ) : (
              <Search
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
            )}
          </div>
          <Button variant="outline" size="icon" title="Filter options">
            <Filter size={18} />
          </Button>
        </div>

        {/* Search results metadata */}
        {searchTerm && searchTerm.length >= 3 && searchMetadata && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>Search results:</span>
            {searchMetadata.localDeviceCount !== undefined && (
              <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs">
                {searchMetadata.localDeviceCount} local
              </span>
            )}
            {searchSyncing && (
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded text-xs flex items-center gap-1">
                <Cloud className="h-3 w-3 animate-pulse" />
                Searching Google...
              </span>
            )}
          </div>
        )}

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 px-3 text-left font-medium text-gray-500 dark:text-gray-400">Asset Tag</th>
                <th className="py-2 px-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Serial Number</th>
                <th className="py-2 px-3 text-left font-medium text-gray-500 dark:text-gray-400">Model</th>
                <th className="py-2 px-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Location</th>
                <th className="py-2 px-3 text-center font-medium text-gray-500 dark:text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredChromebooks.length > 0 ? (
                filteredChromebooks.map((chromebook) => (
                  <tr
                    key={chromebook.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      selectedChromebook?.id === chromebook.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <td className="py-3 px-3">{chromebook.assetTag}</td>
                    <td className="py-3 px-3 font-mono text-xs hidden md:table-cell">{chromebook.serialNumber}</td>
                    <td className="py-3 px-3">{chromebook.model}</td>
                    <td className="py-3 px-3 hidden md:table-cell">{formatOrgUnit(chromebook.orgUnit)}</td>
                    <td className="py-3 px-3 text-center">
                      <Button
                        variant={selectedChromebook?.id === chromebook.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => onSelectChromebook(chromebook)}
                      >
                        {selectedChromebook?.id === chromebook.id ? 'Selected' : 'Select'}
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500 dark:text-gray-400">
                    {debouncedSearchTerm ?
                      'No available Chromebooks found matching your search' :
                      'Start typing to search for available Chromebooks'
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </CardContent>
    </Card>
  );
});

ChromebookSelection.displayName = 'ChromebookSelection';
