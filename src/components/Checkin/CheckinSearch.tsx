
import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chromebook } from '@/types/chromebook';
import { useChromebooks } from '@/hooks/useChromebooks';

interface CheckinSearchProps {
  onSelectChromebook: (chromebook: Chromebook) => void;
}

export const CheckinSearch: React.FC<CheckinSearchProps> = ({ onSelectChromebook }) => {
  const { chromebooks, loading, error } = useChromebooks();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Chromebook[]>([]);
  const [recentResults, setRecentResults] = useState<Chromebook[]>([]);
  const [checkedOutChromebooks, setCheckedOutChromebooks] = useState<Chromebook[]>([]);

  // Filter to only checked-out Chromebooks when data loads
  useEffect(() => {
    if (chromebooks.length > 0) {
      const checkedOut = chromebooks.filter(cb => cb.status === 'checked-out');
      setCheckedOutChromebooks(checkedOut);
      setRecentResults(checkedOut.slice(0, 3));
    }
  }, [chromebooks]);

  const handleSearch = () => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = checkedOutChromebooks.filter(chromebook =>
      chromebook.assetTag.toLowerCase().includes(query) ||
      chromebook.serialNumber.toLowerCase().includes(query) ||
      chromebook.currentUser?.firstName?.toLowerCase().includes(query) ||
      chromebook.currentUser?.lastName?.toLowerCase().includes(query) ||
      chromebook.currentUser?.studentId?.includes(query)
    );

    setSearchResults(filtered);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value.trim() === '') {
      setSearchResults([]);
    }
  };

  const handleSelectChromebook = (chromebook: Chromebook) => {
    onSelectChromebook(chromebook);
    setSearchResults([]);
    setSearchQuery('');

    // Update recent results
    const newRecents = [
      chromebook,
      ...recentResults.filter(cb => cb.id !== chromebook.id),
    ].slice(0, 3);

    setRecentResults(newRecents);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find Checked-Out Device</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Input
            placeholder="Search by ID, serial or student"
            value={searchQuery}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pr-8"
          />
          <Search
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
            size={18}
            onClick={handleSearch}
          />
        </div>

        {searchResults.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Search Results</h3>
            <div className="border rounded-md divide-y divide-gray-200 dark:divide-gray-700 max-h-64 overflow-y-auto">
              {searchResults.map((chromebook) => (
                <div
                  key={chromebook.id}
                  className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  onClick={() => handleSelectChromebook(chromebook)}
                >
                  <div className="font-medium">{chromebook.assetTag}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{chromebook.model}</div>
                  <div className="text-xs mt-1 flex items-center">
                    <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded-full text-[10px]">
                      {chromebook.currentUser?.firstName} {chromebook.currentUser?.lastName} ({chromebook.currentUser?.studentId})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchQuery && searchResults.length === 0 && (
          <div className="text-center p-4 text-gray-500 dark:text-gray-400">
            <p>No checked-out devices found</p>
          </div>
        )}

        {!searchQuery && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Recent Check-outs</h3>
            <div className="border rounded-md divide-y divide-gray-200 dark:divide-gray-700">
              {recentResults.map((chromebook) => (
                <div
                  key={chromebook.id}
                  className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  onClick={() => handleSelectChromebook(chromebook)}
                >
                  <div className="font-medium">{chromebook.assetTag}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{chromebook.model}</div>
                  <div className="text-xs mt-1 flex items-center">
                    <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded-full text-[10px]">
                      {chromebook.currentUser?.firstName} {chromebook.currentUser?.lastName} ({chromebook.currentUser?.studentId})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
