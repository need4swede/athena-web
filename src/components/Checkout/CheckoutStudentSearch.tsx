import React, { useState, useMemo, useCallback } from 'react';
import { Search, UserPlus, Loader2, Cloud, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUnifiedSearch } from '@/hooks/useUnifiedSearch';
import { useAuth } from '@/components/sso/SSOProvider';

interface Student {
  id: string | number;
  firstName: string;
  lastName: string;
  studentId: string;
  email: string;
  orgUnitPath?: string;
  student_db_id?: number; // Add database ID for fee lookups
  source?: 'local' | 'google';
  fullName?: string;
}

interface CheckoutStudentSearchProps {
  onSelectStudent: (student: { firstName: string; lastName: string; studentId: string; email: string; id?: number }) => void;
  selectedStudent?: { firstName: string; lastName: string; studentId: string; email: string; id?: number } | null;
}

export const CheckoutStudentSearch: React.FC<CheckoutStudentSearchProps> = ({ onSelectStudent, selectedStudent }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddNewForm, setShowAddNewForm] = useState(false);
  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', studentId: '', email: '' });

  // Use unified search with checkout context
  const {
    students,
    users,
    loading,
    backgroundSyncing,
    error,
    metadata
  } = useUnifiedSearch(searchTerm, {
    context: 'checkout',
    limit: 50,
    debounceMs: 300
  });

  // Combine students from both sources, prioritizing local database students
  const filteredStudents = useMemo(() => {
    const allStudents: Student[] = [];
    const seenStudentIds = new Set<string>();

    // Add students from the students table first (local database)
    students.forEach(student => {
      if (!seenStudentIds.has(student.studentId)) {
        allStudents.push({
          ...student,
          id: student.id,
          student_db_id: typeof student.id === 'number' ? student.id : undefined
        });
        seenStudentIds.add(student.studentId);
      }
    });

    // Add students from Google users table if they have student IDs and aren't already included
    users.forEach(user => {
      if (user.student_id && !seenStudentIds.has(user.student_id)) {
        allStudents.push({
          id: user.id,
          firstName: user.name.givenName || '',
          lastName: user.name.familyName || '',
          studentId: user.student_id,
          email: user.primaryEmail,
          orgUnitPath: user.orgUnitPath,
          fullName: user.name.fullName,
          source: 'google'
        });
        seenStudentIds.add(user.student_id);
      }
    });

    return allStudents;
  }, [students, users]);

  const handleSelectStudent = (student: Student) => {
    onSelectStudent({
      firstName: student.firstName,
      lastName: student.lastName,
      studentId: student.studentId,
      email: student.email,
      id: student.student_db_id // Pass database ID for fee lookups
    });
  };

  const handleAddNew = () => {
    if (newStudent.firstName && newStudent.lastName && newStudent.studentId) {
      onSelectStudent(newStudent);
      setShowAddNewForm(false);
      setNewStudent({ firstName: '', lastName: '', studentId: '', email: '' });
    }
  };

  // Show search error if it exists
  if (error) {
    console.warn('Search error occurred:', error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Student</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showAddNewForm ? (
          <>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Search by name, ID, or email"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredStudents.length === 1) {
                      handleSelectStudent(filteredStudents[0]);
                    }
                  }}
                  className="pr-8"
                />
                {(loading || backgroundSyncing) ? (
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
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowAddNewForm(true)}
                title="Add new student"
              >
                <UserPlus size={18} />
              </Button>
            </div>

            <div className="border rounded-md divide-y divide-gray-200 dark:divide-gray-700 max-h-64 overflow-y-auto">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student, index) => {
                  const isSelected = selectedStudent?.email === student.email;
                  const studentKey = `${student.source || 'unknown'}-${student.id || index}`;
                  return (
                    <div
                      key={studentKey}
                      className={`p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
                      }`}
                      onClick={() => handleSelectStudent(student)}
                    >
                      <div className="font-medium flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span>{student.firstName} {student.lastName}</span>
                          {student.source === 'google' && (
                            <span title="Found via Google Directory">
                              <Cloud className="h-3 w-3 text-blue-500" />
                            </span>
                          )}
                          {student.source === 'local' && (
                            <span title="Local database">
                              <Database className="h-3 w-3 text-green-500" />
                            </span>
                          )}
                          {backgroundSyncing && (
                            <span title="Syncing with Google...">
                              <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <span>ID: {student.studentId}</span>
                        <div className="text-xs text-gray-400 mt-1">{student.email}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  {searchTerm && searchTerm.length >= 3 ? (
                    loading ? 'Searching...' : 'No students found matching your search'
                  ) : (
                    'Start typing to search for students'
                  )}
                </div>
              )}
            </div>

            {/* Search metadata display for debugging/info */}
            {metadata && searchTerm && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                {metadata.localStudentCount !== undefined && (
                  <div>Local: {metadata.localStudentCount} students</div>
                )}
                {backgroundSyncing && (
                  <div className="flex items-center space-x-1">
                    <Cloud className="h-3 w-3 animate-pulse" />
                    <span>Searching Google for more students...</span>
                  </div>
                )}
              </div>
            )}

          </>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Add New Student</h3>
            <div className="grid grid-cols-1 gap-4">
              <Input
                placeholder="First Name"
                value={newStudent.firstName}
                onChange={(e) => setNewStudent({...newStudent, firstName: e.target.value})}
              />
              <Input
                placeholder="Last Name"
                value={newStudent.lastName}
                onChange={(e) => setNewStudent({...newStudent, lastName: e.target.value})}
              />
              <Input
                placeholder="Student ID"
                value={newStudent.studentId}
                onChange={(e) => setNewStudent({...newStudent, studentId: e.target.value})}
              />
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAddNewForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAddNew}
                  disabled={!newStudent.firstName || !newStudent.lastName || !newStudent.studentId}
                >
                  Add Student
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
