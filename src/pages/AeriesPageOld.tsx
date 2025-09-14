import React, { useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Layout/Header';
import { Sidebar } from '@/components/Layout/Sidebar';
import { useAuth } from '@/components/sso/SSOProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Eye, EyeOff, Check, ChevronRight, ArrowLeft } from 'lucide-react';

type FieldType = 'string' | 'number' | 'date' | 'json';

type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
};

type Operation = {
  key: string;
  label: string;
  resource: 'client' | 'schools' | 'students' | 'enrollment' | 'attendance' | 'grades';
  method: string;
  httpMethod: 'GET' | 'POST';
  fields: Field[];
};

const operations: Record<string, Operation[]> = {
  connection: [
    { key: 'test_connection', label: 'Test Connection', resource: 'client', method: 'test_connection', httpMethod: 'GET', fields: [] },
    { key: 'system_info', label: 'Get System Info', resource: 'schools', method: 'get_system_info', httpMethod: 'GET', fields: [] },
    { key: 'legacy_get_student_data', label: 'Legacy get_student_data', resource: 'client', method: 'get_student_data', httpMethod: 'GET', fields: [
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'client_newly_enrolled', label: 'Newly Enrolled Students (Client)', resource: 'client', method: 'get_newly_enrolled_students', httpMethod: 'GET', fields: [
      { name: 'days', label: 'Days (lookback)', type: 'number', required: false },
      { name: 'since', label: 'Since (ISO date/time)', type: 'string', required: false },
      { name: 'scope', label: 'Scope (district|school)', type: 'string', required: false },
    ]},
    { key: 'get_school', label: 'Get School', resource: 'schools', method: 'get_school', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: false },
    ]},
  ],
  schools: [],
  students: [
    { key: 'get_student', label: 'Get Student', resource: 'students', method: 'get_student', httpMethod: 'GET', fields: [
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'students_by_grade', label: 'Students by Grade', resource: 'students', method: 'get_students_by_grade', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'grade_level', label: 'Grade Level', type: 'string', required: true },
    ]},
    { key: 'contacts', label: 'Student Contacts', resource: 'students', method: 'get_student_contacts', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'programs', label: 'Student Programs', resource: 'students', method: 'get_student_programs', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'tests', label: 'Student Tests', resource: 'students', method: 'get_student_tests', httpMethod: 'GET', fields: [
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'discipline', label: 'Discipline', resource: 'students', method: 'get_student_discipline', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'fees', label: 'Fees & Fines', resource: 'students', method: 'get_student_fees', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'picture', label: 'Student Picture', resource: 'students', method: 'get_student_picture', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'groups', label: 'Student Groups', resource: 'students', method: 'get_student_groups', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID (optional)', type: 'string', required: false },
    ]},
    { key: 'create_student', label: 'Create Student', resource: 'students', method: 'create_student', httpMethod: 'POST', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_data', label: 'Student Data (JSON)', type: 'json', required: true },
    ]},
    { key: 'update_student', label: 'Update Student', resource: 'students', method: 'update_student', httpMethod: 'POST', fields: [
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'student_data', label: 'Student Data (JSON)', type: 'json', required: true },
    ]},
    { key: 'create_contact', label: 'Create Contact', resource: 'students', method: 'create_contact', httpMethod: 'POST', fields: [
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'contact_data', label: 'Contact Data (JSON)', type: 'json', required: true },
    ]},
    { key: 'update_contact', label: 'Update Contact', resource: 'students', method: 'update_contact', httpMethod: 'POST', fields: [
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'sequence_number', label: 'Sequence Number', type: 'number', required: true },
      { name: 'contact_data', label: 'Contact Data (JSON)', type: 'json', required: true },
    ]},
  ],
  enrollment: [
    { key: 'get_enrollment', label: 'Enrollment (school or student)', resource: 'enrollment', method: 'get_enrollment', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: false },
      { name: 'school_year', label: 'School Year', type: 'number', required: false },
    ]},
    { key: 'enrollment_history', label: 'Enrollment History', resource: 'enrollment', method: 'get_enrollment_history', httpMethod: 'GET', fields: [
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'current_enrollment', label: 'Current Enrollment (school)', resource: 'enrollment', method: 'get_current_enrollment', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
    ]},
    { key: 'enrollment_by_grade', label: 'Enrollment by Grade', resource: 'enrollment', method: 'get_enrollment_by_grade', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'grade_level', label: 'Grade Level', type: 'string', required: true },
    ]},
    { key: 'data_changes', label: 'Enrollment Data Changes', resource: 'enrollment', method: 'get_enrollment_data_changes', httpMethod: 'GET', fields: [
      { name: 'year', label: 'Year (YYYY)', type: 'number', required: true },
      { name: 'month', label: 'Month (1-12)', type: 'number', required: true },
      { name: 'day', label: 'Day (1-31)', type: 'number', required: true },
      { name: 'hour', label: 'Hour (0-23)', type: 'number', required: false },
      { name: 'minute', label: 'Minute (0-59)', type: 'number', required: false },
    ]},
    { key: 'new_students', label: 'Newly Enrolled Students', resource: 'enrollment', method: 'get_new_students', httpMethod: 'GET', fields: [
      { name: 'days', label: 'Days (lookback)', type: 'number', required: false },
      { name: 'since', label: 'Since (ISO date/time)', type: 'string', required: false },
      { name: 'scope', label: 'Scope (district|school)', type: 'string', required: false },
    ]},
  ],
  attendance: [
    { key: 'attendance', label: 'Attendance (optional date range)', resource: 'attendance', method: 'get_attendance', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: false },
      { name: 'start_date', label: 'Start Date (YYYY-MM-DD)', type: 'string', required: false },
      { name: 'end_date', label: 'End Date (YYYY-MM-DD)', type: 'string', required: false },
    ]},
    { key: 'daily_attendance', label: 'Daily Attendance', resource: 'attendance', method: 'get_daily_attendance', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'attendance_date', label: 'Date (YYYY-MM-DD)', type: 'string', required: true },
    ]},
    { key: 'attendance_summary', label: 'Attendance Summary', resource: 'attendance', method: 'get_attendance_summary', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'school_year', label: 'School Year', type: 'number', required: false },
    ]},
    { key: 'create_attendance', label: 'Create Attendance', resource: 'attendance', method: 'create_attendance', httpMethod: 'POST', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'attendance_data', label: 'Attendance Data (JSON)', type: 'json', required: true },
    ]},
    { key: 'update_attendance', label: 'Update Attendance', resource: 'attendance', method: 'update_attendance', httpMethod: 'POST', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'attendance_date', label: 'Date (YYYY-MM-DD)', type: 'string', required: true },
      { name: 'attendance_data', label: 'Attendance Data (JSON)', type: 'json', required: true },
    ]},
  ],
  grades: [
    { key: 'grades', label: 'Grades', resource: 'grades', method: 'get_grades', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'term_code', label: 'Term Code', type: 'string', required: false },
      { name: 'school_year', label: 'School Year', type: 'number', required: false },
    ]},
    { key: 'gradebook', label: 'Gradebook Grades', resource: 'grades', method: 'get_gradebook_grades', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'section_number', label: 'Section Number', type: 'string', required: false },
    ]},
    { key: 'transcript', label: 'Transcript', resource: 'grades', method: 'get_transcript', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'gpa', label: 'GPA', resource: 'grades', method: 'get_gpa', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
    ]},
    { key: 'schedule', label: 'Class Schedule', resource: 'grades', method: 'get_class_schedules', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'term_code', label: 'Term Code', type: 'string', required: false },
    ]},
    { key: 'section_grades', label: 'Section Grades', resource: 'grades', method: 'get_section_grades', httpMethod: 'GET', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'section_number', label: 'Section Number', type: 'string', required: true },
      { name: 'term_code', label: 'Term Code', type: 'string', required: false },
    ]},
    { key: 'update_grade', label: 'Update Grade', resource: 'grades', method: 'update_grade', httpMethod: 'POST', fields: [
      { name: 'school_code', label: 'School Code', type: 'string', required: true },
      { name: 'student_id', label: 'Student ID', type: 'string', required: true },
      { name: 'section_number', label: 'Section Number', type: 'string', required: true },
      { name: 'grade_data', label: 'Grade Data (JSON)', type: 'json', required: true },
    ]},
  ],
};

const API_BASE = import.meta.env.VITE_API_URL || '/api';

type School = { SchoolCode: string | number; Name: string };

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-6 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
      title={`Copy ${label || 'value'}`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-gray-500 dark:text-gray-400" />
      )}
    </Button>
  );
}

function StudentDataDisplay({ data }: { data: any }) {
  const [showRaw, setShowRaw] = useState(false);

  if (!data?.data) return null;

  const root = data.data;
  const student = root?.student ?? root;
  const contacts: any[] | null = Array.isArray(root?.contacts) ? root.contacts : null;
  const programs: any[] | null = Array.isArray(root?.programs) ? root.programs : null;
  const tests: any[] | null = Array.isArray(root?.tests) ? root.tests : null;
  const discipline: any[] | null = Array.isArray(root?.discipline) ? root.discipline : null;
  const fees: any[] | null = Array.isArray(root?.fees) ? root.fees : null;
  const picture = root?.picture;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Not specified';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const formatAddress = (address: string, city: string, state: string, zip: string, zipExt?: string) => {
    if (!address && !city) return '';
    const parts = [];
    if (address) parts.push(address);
    if (city && state) {
      const cityState = `${city}, ${state}`;
      if (zip) {
        parts.push(`${cityState} ${zip}${zipExt ? `-${zipExt}` : ''}`);
      } else {
        parts.push(cityState);
      }
    }
    return parts.join(', ');
  };

  const formatStatus = (statusCode: string) => {
    if (statusCode === 'N' || statusCode === '') return 'Active';
    return `Inactive (${statusCode})`;
  };

  const formatLanguageFluency = (code: string) => {
    if (code === 'E') return 'English';
    if (code === 'I') return 'Initial (Limited English)';
    return code;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Student Information</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2"
        >
          {showRaw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showRaw ? 'Hide Raw Data' : 'View Raw Data'}
        </Button>
      </div>

          {showRaw ? (
            <pre className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg text-xs overflow-auto max-h-80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
          {JSON.stringify(data, null, 2)}
            </pre>
          ) : (
        <div className="grid gap-6">
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              Basic Information
              <CopyButton value={`${student.FirstName} ${student.LastName}`} label="student name" />
            </h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Full Name:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {student.FirstName} {student.MiddleName ? `${student.MiddleName} ` : ''}{student.LastName}
                    {student.NameSuffix ? ` ${student.NameSuffix}` : ''}
                  </span>
                  <CopyButton value={`${student.FirstName} ${student.MiddleName ? `${student.MiddleName} ` : ''}${student.LastName}${student.NameSuffix ? ` ${student.NameSuffix}` : ''}`} />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Student ID:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{student.StudentID}</span>
                  <CopyButton value={String(student.StudentID)} />
                </div>
              </div>
              {student.StateStudentID && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">State Student ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{student.StateStudentID}</span>
                    <CopyButton value={String(student.StateStudentID)} />
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Student Number:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{student.StudentNumber}</span>
                  <CopyButton value={String(student.StudentNumber)} />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">School:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {student.SchoolName ? student.SchoolName : `School ${student.SchoolCode}`}
                  </span>
                  <CopyButton value={student.SchoolName || String(student.SchoolCode)} />
                </div>
              </div>
              {student.Grade !== null && student.Grade !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Grade Level:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {student.GradeLevelLongDescription || `Grade ${student.Grade}`}
                  </span>
                </div>
              )}
              {student.Gender && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Gender:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {student.Gender === 'M' ? 'Male' : student.Gender === 'F' ? 'Female' : student.Gender}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Student Picture */}
          {picture && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Student Picture</h4>
              {(() => {
                const first = Array.isArray(picture) ? picture[0] : picture;
                const pic = first?.Pictures && Array.isArray(first.Pictures) ? first.Pictures[0] : first;
                const raw = pic?.RawBinary as string | undefined;
                const src = raw ? `data:image/jpeg;base64,${raw}` : null;
                return src ? (
                  <img
                    src={src}
                    alt="Student picture"
                    className="w-40 h-40 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className="text-sm text-gray-600 dark:text-gray-400">No image available</div>
                );
              })()}
            </div>
          )}

          {/* Contacts (Guardians) */}
          {contacts && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Contacts</h4>
              {contacts.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">No contacts</div>
              ) : (
                <div className="grid gap-3">
                  {contacts.map((c, idx) => (
                    <div key={`${c.SequenceNumber || idx}`} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                      <div className="flex justify-between">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {(c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : (c.MailingName || 'Contact')}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Seq #{c.SequenceNumber ?? '-'}</div>
                      </div>
                      <div className="mt-2 grid gap-1 text-sm">
                        {c.RelationshipToStudentCode && (
                          <div className="text-gray-700 dark:text-gray-300">Relationship: {c.RelationshipToStudentCode}</div>
                        )}
                        {(c.HomePhone || c.WorkPhone || c.CellPhone) && (
                          <div className="text-gray-700 dark:text-gray-300">Phone: {[c.HomePhone, c.WorkPhone, c.CellPhone].filter(Boolean).join(' / ')}</div>
                        )}
                        {c.EmailAddress && (
                          <div className="text-gray-700 dark:text-gray-300">Email: {c.EmailAddress}</div>
                        )}
                        {(c.Address || c.AddressCity) && (
                          <div className="text-gray-700 dark:text-gray-300">Address: {formatAddress(c.Address, c.AddressCity, c.AddressState, c.AddressZipCode, c.AddressZipExt)}</div>
                        )}
                        {typeof c.LivesWithStudentIndicator !== 'undefined' && c.LivesWithStudentIndicator !== '' && (
                          <div className="text-gray-700 dark:text-gray-300">Lives With Student: {String(c.LivesWithStudentIndicator)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tests */}
          {tests && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Tests</h4>
              {tests.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">No test records</div>
              ) : (
                <div className="grid gap-3">
                  {tests.map((t, idx) => (
                    <div key={`${t.SequenceNumber || idx}`} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                      <div className="flex justify-between">
                        <div className="font-medium text-gray-900 dark:text-white">{t.TestDescription || t.TestID}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(t.TestDate)}</div>
                      </div>
                      <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">Part: {t.TestPart || '-'}</div>
                      {Array.isArray(t.Scores) && t.Scores.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                          {t.Scores.map((s: any, i: number) => (
                            <div key={i} className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1">
                              <span className="text-gray-500 dark:text-gray-400">{s.Type}:</span> <span className="text-gray-900 dark:text-gray-100 font-medium">{s.Score}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Programs */}
          {programs && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Programs</h4>
              {programs.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">No programs</div>
              ) : (
                <div className="grid gap-3">
                  {programs.map((p: any, idx: number) => {
                    const extList = Array.isArray(p.ExtendedProperties) ? p.ExtendedProperties : [];
                    const ext: Record<string, any> = {};
                    for (const ep of extList) {
                      if (ep && ep.Name) ext[ep.Name] = ep.Value;
                    }
                    const knownKeys = new Set([
                      'DisabilityCode', 'DisabilityCodeDescription', 'DisabilityCode2', 'DisabilityCode2Description',
                      'ParentalConsentDate', 'ResidenceStatusCode',
                    ]);
                    const otherEntries = Object.entries(ext).filter(([k]) => !knownKeys.has(k));
                    return (
                      <div key={idx} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {p.ProgramDescription || 'Program'}
                          </div>
                          {p.ProgramCode && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              Code: {p.ProgramCode}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2 text-sm">
                          <div className="text-gray-700 dark:text-gray-300">
                            Eligibility: {p.EligibilityStartDate ? formatDate(p.EligibilityStartDate) : '—'}
                            {p.EligibilityEndDate ? ` → ${formatDate(p.EligibilityEndDate)}` : ''}
                          </div>
                          <div className="text-gray-700 dark:text-gray-300">
                            Participation: {p.ParticipationStartDate ? formatDate(p.ParticipationStartDate) : '—'}
                            {p.ParticipationEndDate ? ` → ${formatDate(p.ParticipationEndDate)}` : ''}
                          </div>
                        </div>
                        {(ext.DisabilityCodeDescription || ext.DisabilityCode || ext.DisabilityCode2Description || ext.DisabilityCode2) && (
                          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                            <div className="font-medium text-gray-900 dark:text-white">Disabilities</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {ext.DisabilityCodeDescription && (
                                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  {ext.DisabilityCodeDescription}{ext.DisabilityCode ? ` (${ext.DisabilityCode})` : ''}
                                </span>
                              )}
                              {ext.DisabilityCode2Description && (
                                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  {ext.DisabilityCode2Description}{ext.DisabilityCode2 ? ` (${ext.DisabilityCode2})` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {(ext.ParentalConsentDate || ext.ResidenceStatusCode) && (
                          <div className="mt-2 grid gap-2 md:grid-cols-2 text-sm">
                            {ext.ParentalConsentDate && (
                              <div className="text-gray-700 dark:text-gray-300">Parental Consent: {formatDate(ext.ParentalConsentDate as string)}</div>
                            )}
                            {ext.ResidenceStatusCode && (
                              <div className="text-gray-700 dark:text-gray-300">Residence Status Code: {ext.ResidenceStatusCode}</div>
                            )}
                          </div>
                        )}
                        {otherEntries.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs text-gray-500 dark:text-gray-400">Other Details</div>
                            <div className="mt-1 grid gap-1 md:grid-cols-2">
                              {otherEntries.map(([k, v]) => (
                                <div key={k} className="text-xs text-gray-700 dark:text-gray-300">
                                  <span className="text-gray-500 dark:text-gray-400">{k}:</span> {typeof v === 'string' && v.endsWith('T00:00:00') ? formatDate(v) : String(v)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Groups */}
          {typeof root?.groups !== 'undefined' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Groups</h4>
              {(() => {
                const list = Array.isArray(root?.groups)
                  ? root.groups
                  : (root?.groups ? [root.groups] : []);
                if (list.length === 0) return (
                  <div className="text-sm text-gray-600 dark:text-gray-400">No groups</div>
                );
                return (
                  <div className="grid gap-3">
                    {list.map((g: any, idx: number) => {
                      const students = Array.isArray(g.Students) ? g.Students : [];
                      const staff = Array.isArray(g.Staff) ? g.Staff : [];
                      const flags: string[] = [];
                      if (g.IsCommunicationGroup) flags.push('Communication');
                      if (g.ConfidentialGroup) flags.push('Confidential');
                      return (
                        <div key={g.GroupId ?? idx} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-900 dark:text-white">{g.Name || 'Group'}</div>
                            <div className="flex items-center gap-2">
                              {typeof g.GroupId !== 'undefined' && (
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                  ID: {g.GroupId}
                                </span>
                              )}
                              {typeof g.SchoolCode !== 'undefined' && (
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                  School: {g.SchoolCode}
                                </span>
                              )}
                            </div>
                          </div>
                          {g.Description && (
                            <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">{g.Description}</div>
                          )}
                          <div className="mt-2 grid gap-2 md:grid-cols-2 text-sm">
                            <div className="text-gray-700 dark:text-gray-300">Expires: {g.ExpirationDate ? formatDate(g.ExpirationDate) : '—'}</div>
                            <div className="flex flex-wrap gap-2">
                              {flags.length > 0 ? (
                                flags.map((f) => (
                                  <span key={f} className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    {f}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-gray-500 dark:text-gray-400">No flags</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                              <div className="text-gray-500 dark:text-gray-400 text-xs">Students</div>
                              <div className="text-gray-900 dark:text-gray-100 text-sm font-medium">{students.length}</div>
                            </div>
                            <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                              <div className="text-gray-500 dark:text-gray-400 text-xs">Staff</div>
                              <div className="text-gray-900 dark:text-gray-100 text-sm font-medium">{staff.length}</div>
                            </div>
                          </div>
                          {(students.length > 0 || staff.length > 0) && (
                            <div className="mt-2 grid gap-2 md:grid-cols-2 text-xs">
                              {students.length > 0 && (
                                <div>
                                  <div className="text-gray-500 dark:text-gray-400">Student IDs</div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {students.map((s: any, i: number) => (
                                      <span key={i} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                        {s?.StudentId ?? s?.StudentID ?? s?.id ?? String(s)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {staff.length > 0 && (
                                <div>
                                  <div className="text-gray-500 dark:text-gray-400">Staff IDs</div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {staff.map((st: any, i: number) => (
                                      <span key={i} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                        {st?.StaffId ?? st?.StaffID ?? st?.id ?? String(st)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Discipline */}
          {discipline && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Discipline</h4>
              {discipline.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">No discipline records</div>
              ) : (
                <div className="grid gap-3">
                  {discipline.map((d, dIdx) => (
                    <div key={dIdx} className="grid gap-2">
                      {Array.isArray(d.Disciplines) && d.Disciplines.map((inc: any, i: number) => (
                        <div key={`${inc.SequenceNumber || i}`} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                          <div className="flex justify-between">
                            <div className="font-medium text-gray-900 dark:text-white">Violation: {inc.ViolationCode1 || '-'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(inc.IncidentDate)}</div>
                          </div>
                          {inc.Comment && (
                            <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{inc.Comment}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fees & Fines */}
          {fees && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Fees & Fines</h4>
              {fees.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">No fees</div>
              ) : (
                (() => {
                  const formatCurrency = (n: number | string | null | undefined) => {
                    const v = typeof n === 'string' ? Number(n) : (n ?? 0);
                    return v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
                  };
                  // Flatten Aeries shape: [{ StudentID, Fees: [ ... ] }, ...] into rows
                  const rows: any[] = [];
                  for (const rec of fees as any[]) {
                    if (rec && Array.isArray(rec.Fees)) {
                      for (const item of rec.Fees) {
                        rows.push({ StudentID: rec.StudentID, ...item });
                      }
                    } else if (rec && typeof rec === 'object') {
                      rows.push(rec);
                    }
                  }
                  // Totals
                  let totalCharged = 0, totalPaid = 0;
                  for (const r of rows) {
                    totalCharged += Number(r.AmountCharged || 0);
                    totalPaid += Number(r.AmountPaid || 0);
                  }
                  const totalBalance = totalCharged - totalPaid;
                  // Sort by DateCharged desc
                  rows.sort((a, b) => {
                    const da = a.DateCharged ? new Date(a.DateCharged).getTime() : 0;
                    const db = b.DateCharged ? new Date(b.DateCharged).getTime() : 0;
                    return db - da;
                  });
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                          <div className="text-gray-500 dark:text-gray-400">Total Charged</div>
                          <div className="font-medium text-gray-900 dark:text-white">{formatCurrency(totalCharged)}</div>
                        </div>
                        <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                          <div className="text-gray-500 dark:text-gray-400">Total Paid</div>
                          <div className="font-medium text-gray-900 dark:text-white">{formatCurrency(totalPaid)}</div>
                        </div>
                        <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                          <div className="text-gray-500 dark:text-gray-400">Total Balance</div>
                          <div className="font-medium text-gray-900 dark:text-white">{formatCurrency(totalBalance)}</div>
                        </div>
                      </div>
                      <div className="overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-600 dark:text-gray-300">
                              <th className="py-2 pr-4">Fee Code</th>
                              <th className="py-2 pr-4">Charged</th>
                              <th className="py-2 pr-4">Paid</th>
                              <th className="py-2 pr-4">Balance</th>
                              <th className="py-2 pr-4">Date Charged</th>
                              <th className="py-2 pr-4">Date Paid</th>
                              <th className="py-2 pr-4">Receipt #</th>
                              <th className="py-2 pr-4">School</th>
                              <th className="py-2 pr-4">Comment</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, idx) => {
                              const bal = Number(r.AmountCharged || 0) - Number(r.AmountPaid || 0);
                              return (
                                <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                                  <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{r.FeeCode || '-'}</td>
                                  <td className="py-2 pr-4">{formatCurrency(r.AmountCharged)}</td>
                                  <td className="py-2 pr-4">{formatCurrency(r.AmountPaid)}</td>
                                  <td className="py-2 pr-4">{formatCurrency(bal)}</td>
                                  <td className="py-2 pr-4">{r.DateCharged ? formatDate(r.DateCharged) : '—'}</td>
                                  <td className="py-2 pr-4">{r.DatePaid ? formatDate(r.DatePaid) : '—'}</td>
                                  <td className="py-2 pr-4">{r.ReceiptNumber || '—'}</td>
                                  <td className="py-2 pr-4">{r.SchoolCode ?? '—'}</td>
                                  <td className="py-2 pr-4 max-w-[360px] truncate" title={r.Comment || ''}>{r.Comment || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* Personal Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Personal Information</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {student.Birthdate && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Birth Date:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatDate(student.Birthdate)}</span>
                </div>
              )}
              {student.EthnicityCode && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Ethnicity Code:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{student.EthnicityCode}</span>
                </div>
              )}
              {student.RaceCode1 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Race Code:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{student.RaceCode1}</span>
                </div>
              )}
              {student.LanguageFluencyCode && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Language Fluency:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatLanguageFluency(student.LanguageFluencyCode)}
                  </span>
                </div>
              )}
              {student.HomeLanguageCode && student.HomeLanguageCode !== '00' && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Home Language Code:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{student.HomeLanguageCode}</span>
                </div>
              )}
              {student.ParentEdLevelCode && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Parent Education Level:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{student.ParentEdLevelCode}</span>
                </div>
              )}
            </div>
          </div>

          {/* Academic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Academic Information</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatStatus(student.InactiveStatusCode)}
                </span>
              </div>
              {student.SchoolEnterDate && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">School Enter Date:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatDate(student.SchoolEnterDate)}</span>
                </div>
              )}
              {student.DistrictEnterDate && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">District Enter Date:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatDate(student.DistrictEnterDate)}</span>
                </div>
              )}
              {student.SchoolLeaveDate && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">School Leave Date:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatDate(student.SchoolLeaveDate)}</span>
                </div>
              )}
              {student.NextGrade && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Next Grade:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {student.NextGradeLevelLongDescription || `Grade ${student.NextGrade}`}
                  </span>
                </div>
              )}
              {student.Track && student.Track.trim() && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Track:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{student.Track}</span>
                </div>
              )}
              {student.NetworkLoginID && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Network Login ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{student.NetworkLoginID}</span>
                    <CopyButton value={student.NetworkLoginID} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Contact Information</h4>
            <div className="grid gap-3">
              {student.MailingAddress && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Mailing Address:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white text-right">
                      {formatAddress(student.MailingAddress, student.MailingAddressCity, student.MailingAddressState, student.MailingAddressZipCode, student.MailingAddressZipExt)}
                    </span>
                    <CopyButton value={formatAddress(student.MailingAddress, student.MailingAddressCity, student.MailingAddressState, student.MailingAddressZipCode, student.MailingAddressZipExt)} />
                  </div>
                </div>
              )}
              {student.ResidenceAddress && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Residence Address:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white text-right">
                      {formatAddress(student.ResidenceAddress, student.ResidenceAddressCity, student.ResidenceAddressState, student.ResidenceAddressZipCode, student.ResidenceAddressZipExt)}
                    </span>
                    <CopyButton value={formatAddress(student.ResidenceAddress, student.ResidenceAddressCity, student.ResidenceAddressState, student.ResidenceAddressZipCode, student.ResidenceAddressZipExt)} />
                  </div>
                </div>
              )}
              {student.HomePhone && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Home Phone:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{student.HomePhone}</span>
                    <CopyButton value={student.HomePhone} />
                  </div>
                </div>
              )}
              {student.StudentMobilePhone && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Student Mobile:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{student.StudentMobilePhone}</span>
                    <CopyButton value={student.StudentMobilePhone} />
                  </div>
                </div>
              )}
              {student.StudentEmailAddress && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Student Email:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{student.StudentEmailAddress}</span>
                    <CopyButton value={student.StudentEmailAddress} />
                  </div>
                </div>
              )}
              {student.ParentEmailAddress && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Parent Email:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{student.ParentEmailAddress}</span>
                    <CopyButton value={student.ParentEmailAddress} />
                  </div>
                </div>
              )}
              {student.ParentGuardianName && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Parent/Guardian:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{student.ParentGuardianName}</span>
                    <CopyButton value={student.ParentGuardianName} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SchoolDataDisplay({ data }: { data: any }) {
  const [showRaw, setShowRaw] = useState(false);

  if (!data?.data) return null;

  const school = data.data;
  const terms = school.Terms || [];

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Not specified';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const formatGradeRange = (low: number, high: number) => {
    if (low === -1 && high === -1) return 'Not specified';
    if (low === -1) return `Up to grade ${high}`;
    if (high === -1) return `Grade ${low} and above`;
    if (low === high) return `Grade ${low}`;
    return `Grades ${low}-${high}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">School Information</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2"
        >
          {showRaw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showRaw ? 'Hide Raw Data' : 'View Raw Data'}
        </Button>
      </div>

      {showRaw ? (
        <pre className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg text-xs overflow-auto max-h-80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div className="grid gap-6">
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              Basic Information
              <CopyButton value={school.Name} label="school name" />
            </h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Name:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{school.Name}</span>
                  <CopyButton value={school.Name} />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">School Code:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{school.SchoolCode}</span>
                  <CopyButton value={String(school.SchoolCode)} />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Grade Levels:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatGradeRange(school.LowGradeLevel, school.HighGradeLevel)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Schedule Type:</span>
                <span className="font-medium text-gray-900 dark:text-white">{school.ScheduleType}</span>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Contact Information</h4>
            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Address:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white text-right">
                    {school.Address}, {school.AddressCity}, {school.AddressState} {school.AddressZipCode}
                  </span>
                  <CopyButton value={`${school.Address}, ${school.AddressCity}, ${school.AddressState} ${school.AddressZipCode}`} />
                </div>
              </div>
              {school.PhoneNumber && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Phone:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{school.PhoneNumber}</span>
                    <CopyButton value={school.PhoneNumber} />
                  </div>
                </div>
              )}
              {school.PrincipalName && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Principal:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{school.PrincipalName}</span>
                    <CopyButton value={school.PrincipalName} />
                  </div>
                </div>
              )}
              {school.PrincipalEmailAddress && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Principal Email:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{school.PrincipalEmailAddress}</span>
                    <CopyButton value={school.PrincipalEmailAddress} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* State & District IDs */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Identification Numbers</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {school.StateSchoolID && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">State School ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{school.StateSchoolID}</span>
                    <CopyButton value={school.StateSchoolID} />
                  </div>
                </div>
              )}
              {school.StateDistrictID && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">State District ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{school.StateDistrictID}</span>
                    <CopyButton value={school.StateDistrictID} />
                  </div>
                </div>
              )}
              {school.NCESSchoolID && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">NCES School ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{school.NCESSchoolID}</span>
                    <CopyButton value={school.NCESSchoolID} />
                  </div>
                </div>
              )}
              {school.StateCharterNumber && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Charter Number:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{school.StateCharterNumber}</span>
                    <CopyButton value={school.StateCharterNumber} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Academic Terms */}
          {terms.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Academic Terms</h4>
              <div className="grid gap-3">
                {terms.map((term: any, index: number) => (
                  <div key={index} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">{term.TermDescription} ({term.TermCode})</span>
                      <CopyButton value={`${term.TermDescription} (${term.TermCode}): ${formatDate(term.StartDate)} - ${formatDate(term.EndDate)}`} />
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(term.StartDate)} - {formatDate(term.EndDate)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* System Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">System Configuration</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Session Type:</span>
                <span className="font-medium text-gray-900 dark:text-white">{school.SessionType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Schedule Basis:</span>
                <span className="font-medium text-gray-900 dark:text-white">{school.ScheduleBasis}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Attendance Type:</span>
                <span className="font-medium text-gray-900 dark:text-white">{school.AttendanceType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Attendance Reporting:</span>
                <span className="font-medium text-gray-900 dark:text-white">{school.AttendanceReporting}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SchoolsTabContent({ schools }: { schools: School[] }) {
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [schoolsData, setSchoolsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSchools = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${API_BASE}/aeries/schools/get_all_schools`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || 'Failed to load schools');
        setSchoolsData(data);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    loadSchools();
  }, []);

  const formatGradeRange = (low: number, high: number) => {
    if (low === -1 && high === -1) return 'Not specified';
    if (low === -1) return `Up to grade ${high}`;
    if (high === -1) return `Grade ${low} and above`;
    if (low === high) return `Grade ${low}`;
    return `Grades ${low}-${high}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-600 dark:text-gray-400">Loading schools...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
        {error}
      </div>
    );
  }

  if (!schoolsData?.data || !Array.isArray(schoolsData.data)) {
    return (
      <div className="text-gray-600 dark:text-gray-400">No schools data available.</div>
    );
  }

  if (selectedSchool) {
    const schoolData = { success: true, data: selectedSchool };
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedSchool(null)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Schools List
          </Button>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {selectedSchool.Name}
          </h3>
        </div>
        <SchoolDataDisplay data={schoolData} />
      </div>
    );
  }

  const schoolsList = schoolsData.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Schools ({schoolsList.length} schools)
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2"
        >
          {showRaw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showRaw ? 'Hide Raw Data' : 'View Raw Data'}
        </Button>
      </div>

      {showRaw ? (
        <pre className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg text-xs overflow-auto max-h-80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
          {JSON.stringify(schoolsData, null, 2)}
        </pre>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {schoolsList.map((school: any) => (
            <div
              key={school.SchoolCode}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
              onClick={() => setSelectedSchool(school)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      {school.Name}
                    </h4>
                    <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      Code: {school.SchoolCode}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 dark:text-gray-400">Grades:</span>
                      <span className="text-gray-900 dark:text-white">
                        {formatGradeRange(school.LowGradeLevel, school.HighGradeLevel)}
                      </span>
                    </div>

                    {school.PrincipalName && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 dark:text-gray-400">Principal:</span>
                        <span className="text-gray-900 dark:text-white">{school.PrincipalName}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 dark:text-gray-400">Type:</span>
                      <span className="text-gray-900 dark:text-white">{school.ScheduleType}</span>
                    </div>
                  </div>

                  {(school.Address || school.AddressCity) && (
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {school.Address && `${school.Address}, `}
                      {school.AddressCity && school.AddressState &&
                        `${school.AddressCity}, ${school.AddressState} ${school.AddressZipCode}`}
                    </div>
                  )}

                  {school.StateCharterNumber && (
                    <div className="mt-2">
                      <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                        Charter: {school.StateCharterNumber}
                      </span>
                    </div>
                  )}
                </div>

                <div className="ml-4">
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldInput({ field, value, onChange, schools }: { field: Field; value: any; onChange: (v: any) => void; schools?: School[] }) {
  if (field.type === 'json') {
    return (
      <div className="grid gap-2">
        <Label htmlFor={field.name} className="text-gray-700 dark:text-gray-300 font-medium">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <textarea
          id={field.name}
          className="min-h-[120px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
          placeholder='{ "key": "value" }'
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      </div>
    );
  }
  if (field.name === 'school_code' && schools && schools.length > 0) {
    return (
      <div className="grid gap-2">
        <Label htmlFor={field.name} className="text-gray-700 dark:text-gray-300 font-medium">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Select value={value} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
            <SelectValue placeholder="Select a school" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            {schools.map((s) => (
              <SelectItem
                key={String(s.SchoolCode)}
                value={String(s.SchoolCode)}
                className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {s.Name} ({s.SchoolCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor={field.name} className="text-gray-700 dark:text-gray-300 font-medium">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Input
        id={field.name}
        type={field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
      />
    </div>
  );
}

function OperationForm({ op, schools }: { op: Operation; schools?: School[] }) {
  const initial = useMemo(() => {
    const acc: Record<string, any> = {};
    op.fields.forEach((f) => (acc[f.name] = ''));
    return acc;
  }, [op]);

  const [values, setValues] = useState<Record<string, any>>(initial);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Build params
      const params: Record<string, any> = {};
      for (const f of op.fields) {
        let v = values[f.name];
        if (v === '' || v === undefined || v === null) {
          continue;
        }
        if (f.type === 'number') {
          const num = Number(v);
          if (!Number.isNaN(num)) params[f.name] = num;
        } else if (f.type === 'json') {
          try {
            params[f.name] = JSON.parse(v);
          } catch (err) {
            throw new Error(`${f.label} must be valid JSON`);
          }
        } else {
          params[f.name] = v;
        }
      }

      // Enable combined student details for Get Student
      if (op.key === 'get_student') {
        params.include_all = true;
      }

      const url = `${API_BASE}/aeries/${op.resource}/${op.method}`;
      let resp: Response;
      if (op.httpMethod === 'GET') {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          query.set(k, String(v));
        });
        resp = await fetch(`${url}?${query.toString()}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        });
      } else {
        resp = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
          body: JSON.stringify(params),
        });
      }
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'Request failed');
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200/60 dark:border-gray-700/60 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm p-6 space-y-4">
      <div className="font-semibold text-gray-900 dark:text-white text-lg">{op.label}</div>
      <form onSubmit={onSubmit} className="grid gap-4">
        {op.fields.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {op.fields.map((f) => (
              <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} schools={schools} />
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            {loading ? 'Running...' : 'Run'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { setValues(initial); setResult(null); setError(null); }}
            className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Reset
          </Button>
        </div>
      </form>
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-4">
          {op.key === 'get_school' && result.success && result.data ? (
            <SchoolDataDisplay data={result} />
          ) : op.key === 'get_student' && result.success && result.data ? (
            <StudentDataDisplay data={result} />
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">API Response</div>
              <pre className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg text-xs overflow-auto max-h-80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
{JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AeriesPage() {
  const [activeSection] = useState('aeries');
  const { user } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);

  // Convert SSO user to the format expected by Sidebar component
  const userRole = user?.role === 'super_admin' ? 'super-admin' as const :
                   user?.role === 'admin' ? 'admin' as const :
                   'user' as const;

  useEffect(() => {
    const loadSchools = async () => {
      setLoadingSchools(true);
      setSchoolsError(null);
      try {
        const resp = await fetch(`${API_BASE}/aeries/schools/get_all_schools`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || 'Failed to load schools');
        const list = Array.isArray(data?.data) ? data.data : [];
        setSchools(list);
      } catch (e: any) {
        setSchoolsError(e?.message || String(e));
      } finally {
        setLoadingSchools(false);
      }
    };
    loadSchools();
  }, []);


  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50/80 dark:bg-black/80 transition-colors duration-300">
        <Header />
        <div className="flex">
          <Sidebar
            activeSection={activeSection}
            onSectionChange={() => {}}
            userRole={userRole}
          />
          <main className="flex-1 p-8">
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Aeries Integration</h1>
                <p className="text-gray-600 dark:text-gray-400">Interact with Aeries SIS API (Admin/Super-Admin only)</p>
              </div>

              <div className="rounded-lg border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-6">
                <Tabs defaultValue="connection" className="space-y-4">
                  <TabsList className="grid grid-cols-6 w-full bg-gray-100 dark:bg-gray-800">
                    <TabsTrigger value="connection" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white">Connection</TabsTrigger>
                    <TabsTrigger value="schools" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white">Schools</TabsTrigger>
                    <TabsTrigger value="students" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white">Students</TabsTrigger>
                    <TabsTrigger value="enrollment" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white">Enrollment</TabsTrigger>
                    <TabsTrigger value="attendance" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white">Attendance</TabsTrigger>
                    <TabsTrigger value="grades" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white">Grades</TabsTrigger>
                  </TabsList>
                  {Object.entries(operations).map(([key, ops]) => (
                    <TabsContent key={key} value={key} className="space-y-4 pt-4">
                      {key === 'schools' ? (
                        <SchoolsTabContent schools={schools} />
                      ) : (
                        ops.map((op) => (
                          <OperationForm key={op.key} op={op} schools={schools} />
                        ))
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200/60 dark:border-gray-800/60">
                {loadingSchools ? 'Loading schools…' : schoolsError ? `Schools error: ${schoolsError}` : `Loaded ${schools.length} school(s)`}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}

function getAuthHeader(): string {
  const token = localStorage.getItem('sso_token') || localStorage.getItem('auth_token') || localStorage.getItem('authToken');
  return token ? `Bearer ${token}` : '';
}
