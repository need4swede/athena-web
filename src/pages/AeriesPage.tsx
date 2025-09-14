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
import { Copy, Eye, EyeOff, Check, ChevronRight, ArrowLeft, User, Mail, Users, GraduationCap, BookOpen } from 'lucide-react';

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
      className="h-8 w-8 p-0 hover:bg-gray-100/80 dark:hover:bg-gray-700/80 rounded-lg backdrop-blur-sm transition-all duration-200 hover:shadow-sm"
      title={`Copy ${label || 'value'}`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4 text-gray-500 dark:text-gray-400" />
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

  // Derived visibility flags based on actual data presence (after server sanitization)
  const hasContactInfo = !!(
    student?.StudentEmailAddress || student?.ParentEmailAddress ||
    student?.StudentMobilePhone || student?.HomePhone || student?.NetworkLoginID
  );
  const hasPersonalInfo = !!(
    student?.EthnicityCode || student?.RaceCode1 ||
    student?.LanguageFluencyCode || (student?.HomeLanguageCode && student?.HomeLanguageCode !== '00') ||
    student?.ParentEdLevelCode
  );
  const hasAcademicTimeline = !!(
    student?.SchoolEnterDate || student?.DistrictEnterDate || student?.NextGrade || (student?.Track && student?.Track.trim())
  );

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
    <div className="space-y-8">
      {/* Header with Apple-style design */}
      <div className="flex items-center justify-between bg-gray-50/80 dark:bg-gray-900/40 backdrop-blur-sm rounded-2xl p-6 border border-gray-300/40 dark:border-gray-700/30">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Student Profile</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Comprehensive student information</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2 rounded-xl backdrop-blur-sm border-gray-200/60 dark:border-gray-700/60 hover:shadow-sm transition-all duration-200 px-4 py-2 font-medium"
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
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Consolidated Student Overview */}
          <div className=" from-slate-50/90 to-gray-50/70 dark:from-gray-800/90 dark:to-gray-900/50 rounded-3xl p-8 border border-slate-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-lg">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-slate-500/10 dark:bg-slate-400/10 rounded-2xl flex items-center justify-center">
                <User className="w-6 h-6 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white text-xl tracking-tight">Student Overview</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">Essential student information</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Full Name & Photo Column */}
              <div className="lg:col-span-1">
                <div className="bg-white/80 dark:bg-gray-900/50 rounded-2xl p-6 border border-slate-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="text-center space-y-4">
                    {/* Profile Photo */}
                    <div className="relative group">
                      {picture && (() => {
                        const first = Array.isArray(picture) ? picture[0] : picture;
                        const pic = first?.Pictures && Array.isArray(first.Pictures) ? first.Pictures[0] : first;
                        const raw = pic?.RawBinary as string | undefined;
                        const src = raw ? `data:image/jpeg;base64,${raw}` : null;
                        return src ? (
                          <div className="relative w-40 h-40 xl:w-48 xl:h-48">
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-indigo-600/20 rounded-full blur-xl" />
                            <img
                              src={src}
                              alt="Student picture"
                              className="relative w-full h-full object-cover rounded-full border-6 border-white/90 dark:border-gray-800/90 shadow-2xl transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 rounded-full ring-4 ring-blue-500/20 dark:ring-blue-400/20" />
                          </div>
                        ) : (
                          <div className="relative w-40 h-40 xl:w-48 xl:h-48  from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-full flex items-center justify-center border-6 border-white/90 dark:border-gray-800/90 shadow-2xl">
                            <div className="absolute inset-0  from-blue-400/10 to-indigo-600/10 rounded-full blur-xl" />
                            <User className="relative w-20 h-20 text-gray-400 dark:text-gray-500" />
                            <div className="absolute inset-0 rounded-full ring-4 ring-gray-300/30 dark:ring-gray-600/30" />
                          </div>
                        );
                      })() || (
                        <div className="relative w-40 h-40 xl:w-48 xl:h-48  from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-full flex items-center justify-center border-6 border-white/90 dark:border-gray-800/90 shadow-2xl">
                          <div className="absolute inset-0  from-blue-400/10 to-indigo-600/10 rounded-full blur-xl" />
                          <User className="relative w-20 h-20 text-gray-400 dark:text-gray-500" />
                          <div className="absolute inset-0 rounded-full ring-4 ring-gray-300/30 dark:ring-gray-600/30" />
                        </div>
                      )}
                    </div>

                    {/* Full Name */}
                    <div className="text-center xl:text-left">
                      <div className="space-y-2">
                        <h1 className="text-4xl xl:text-5xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                          {student.FirstName}
                          {student.MiddleName && (
                            <span className="text-gray-600 dark:text-gray-400 font-medium"> {student.MiddleName}</span>
                          )}
                          <span className="block xl:inline"> {student.LastName}</span>
                          {student.NameSuffix && (
                            <span className="text-gray-500 dark:text-gray-500 font-normal"> {student.NameSuffix}</span>
                          )}
                        </h1>
                        <div className="flex items-center justify-center xl:justify-start gap-2 mt-3">
                          <CopyButton value={`${student.FirstName} ${student.MiddleName ? `${student.MiddleName} ` : ''}${student.LastName}${student.NameSuffix ? ` ${student.NameSuffix}` : ''}`} />
                          <span className="text-xs text-gray-500 dark:text-gray-400">Copy full name</span>
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-sm shadow-sm border ${
                      formatStatus(student.InactiveStatusCode) === 'Active'
                        ? 'bg-green-50/90 text-green-700 border-green-200/60 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700/50'
                        : 'bg-red-50/90 text-red-700 border-red-200/60 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700/50'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        formatStatus(student.InactiveStatusCode) === 'Active'
                          ? 'bg-green-500 shadow-sm shadow-green-500/50'
                          : 'bg-red-500 shadow-sm shadow-red-500/50'
                      }`} />
                      {formatStatus(student.InactiveStatusCode)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Student Details Grid */}
              <div className="lg:col-span-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Student IDs */}
                  <div className="bg-white/80 dark:bg-gray-900/50 rounded-2xl p-4 border border-slate-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">#</span>
                      </div>
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student IDs</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 dark:text-gray-400">ID:</span>
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-white bg-gray-100/80 dark:bg-gray-800/80 px-2 py-1 rounded">{student.StudentID}</span>
                        <CopyButton value={String(student.StudentID)} />
                      </div>
                      {student.StateStudentID && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400">State:</span>
                          <span className="font-mono text-sm font-medium text-gray-900 dark:text-white bg-gray-100/80 dark:bg-gray-800/80 px-2 py-1 rounded">{student.StateStudentID}</span>
                          <CopyButton value={String(student.StateStudentID)} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* School */}
                  <div className="bg-white/80 dark:bg-gray-900/50 rounded-2xl p-4 border border-slate-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <GraduationCap className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">School</span>
                    </div>
                    <div className="space-y-1">
                      <div className="font-bold text-gray-900 dark:text-white text-sm leading-tight">
                        {student.SchoolName || `School ${student.SchoolCode}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100/80 dark:bg-gray-700/80 px-2 py-1 rounded">
                          Code: {student.SchoolCode}
                        </span>
                        <CopyButton value={student.SchoolName || String(student.SchoolCode)} />
                      </div>
                    </div>
                  </div>

                  {/* Grade Level */}
                  {student.Grade !== null && student.Grade !== undefined && (
                    <div className="bg-white/80 dark:bg-gray-900/50 rounded-2xl p-4 border border-slate-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                          <BookOpen className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Grade Level</span>
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-lg">
                        {student.GradeLevelLongDescription || `Grade ${student.Grade}`}
                      </div>
                    </div>
                  )}

                  {/* Gender */}
                  {student.Gender && (
                    <div className="bg-white/80 dark:bg-gray-900/50 rounded-2xl p-4 border border-slate-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 bg-purple-500/10 rounded-lg flex items-center justify-center">
                          <User className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gender</span>
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-lg">
                        {student.Gender === 'M' ? 'Male' : student.Gender === 'F' ? 'Female' : student.Gender}
                      </div>
                    </div>
                  )}

                  {/* Birthday */}
                  {student.Birthdate && (
                    <div className="bg-white/80 dark:bg-gray-900/50 rounded-2xl p-4 border border-slate-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm sm:col-span-2">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 bg-orange-500/10 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-orange-600 dark:text-orange-400">🎂</span>
                        </div>
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Birth Date</span>
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-lg">
                        {formatDate(student.Birthdate)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          {hasContactInfo && (
          <div className=" from-blue-50/80 to-cyan-50/60 dark:from-gray-800/90 dark:to-blue-900/10 rounded-2xl p-8 border border-blue-200/40 dark:border-gray-700/30 backdrop-blur-sm shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-500/10 dark:bg-blue-400/10 rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">Contact Information</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">Email addresses and phone numbers</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {student.StudentEmailAddress && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
                      <Mail className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student Email</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white break-all">{student.StudentEmailAddress}</span>
                    <CopyButton value={student.StudentEmailAddress} />
                  </div>
                </div>
              )}
              {student.ParentEmailAddress && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-green-500/10 rounded-lg flex items-center justify-center">
                      <Mail className="w-3 h-3 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Parent Email</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white break-all">{student.ParentEmailAddress}</span>
                    <CopyButton value={student.ParentEmailAddress} />
                  </div>
                </div>
              )}
              {student.StudentMobilePhone && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-purple-500/10 rounded-lg flex items-center justify-center">
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400">📱</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student Mobile</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white font-mono">{student.StudentMobilePhone}</span>
                    <CopyButton value={student.StudentMobilePhone} />
                  </div>
                </div>
              )}
              {student.HomePhone && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-orange-500/10 rounded-lg flex items-center justify-center">
                      <span className="text-xs font-bold text-orange-600 dark:text-orange-400">🏠</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Home Phone</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white font-mono">{student.HomePhone}</span>
                    <CopyButton value={student.HomePhone} />
                  </div>
                </div>
              )}
              {student.NetworkLoginID && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">🔐</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Network ID</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white font-mono bg-gray-100/80 dark:bg-gray-800/80 px-3 py-1 rounded-lg">{student.NetworkLoginID}</span>
                    <CopyButton value={student.NetworkLoginID} />
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Address Information */}
          {(student.MailingAddress || student.ResidenceAddress) && (
            <div className=" from-green-50/80 to-emerald-50/60 dark:from-gray-800/90 dark:to-green-900/10 rounded-2xl p-8 border border-green-200/40 dark:border-gray-700/30 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-green-500/10 dark:bg-green-400/10 rounded-xl flex items-center justify-center">
                  <span className="text-lg">🏠</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">Address Information</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Mailing and residence addresses</p>
                </div>
              </div>
              <div className="space-y-4">
                {student.MailingAddress && (
                  <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-5 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <span className="text-xs">📬</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mailing Address</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white leading-relaxed">
                          {formatAddress(student.MailingAddress, student.MailingAddressCity, student.MailingAddressState, student.MailingAddressZipCode, student.MailingAddressZipExt)}
                        </p>
                      </div>
                      <CopyButton value={formatAddress(student.MailingAddress, student.MailingAddressCity, student.MailingAddressState, student.MailingAddressZipCode, student.MailingAddressZipExt)} />
                    </div>
                  </div>
                )}
                {student.ResidenceAddress && (
                  <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-5 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-green-500/10 rounded-lg flex items-center justify-center">
                        <span className="text-xs">🏡</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Residence Address</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white leading-relaxed">
                          {formatAddress(student.ResidenceAddress, student.ResidenceAddressCity, student.ResidenceAddressState, student.ResidenceAddressZipCode, student.ResidenceAddressZipExt)}
                        </p>
                      </div>
                      <CopyButton value={formatAddress(student.ResidenceAddress, student.ResidenceAddressCity, student.ResidenceAddressState, student.ResidenceAddressZipCode, student.ResidenceAddressZipExt)} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Personal Information */}
          {hasPersonalInfo && (
          <div className=" from-purple-50/80 to-pink-50/60 dark:from-gray-800/90 dark:to-purple-900/10 rounded-2xl p-8 border border-purple-200/40 dark:border-gray-700/30 backdrop-blur-sm shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-500/10 dark:bg-purple-400/10 rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">Personal Information</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">Demographics and background details</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {student.EthnicityCode && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Ethnicity Code</div>
                  <div className="font-bold text-gray-900 dark:text-white">{student.EthnicityCode}</div>
                </div>
              )}
              {student.RaceCode1 && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Race Code</div>
                  <div className="font-bold text-gray-900 dark:text-white">{student.RaceCode1}</div>
                </div>
              )}
              {student.LanguageFluencyCode && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Language Fluency</div>
                  <div className="font-bold text-gray-900 dark:text-white">
                    {formatLanguageFluency(student.LanguageFluencyCode)}
                  </div>
                </div>
              )}
              {student.HomeLanguageCode && student.HomeLanguageCode !== '00' && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Home Language Code</div>
                  <div className="font-bold text-gray-900 dark:text-white">{student.HomeLanguageCode}</div>
                </div>
              )}
              {student.ParentEdLevelCode && (
                <div className="bg-white/80 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-300/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Parent Education Level</div>
                  <div className="font-bold text-gray-900 dark:text-white">{student.ParentEdLevelCode}</div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Secondary Information Sections */}
          <div className="space-y-8 mt-12">
            {/* Academic Information */}
            {hasAcademicTimeline && (
            <div className=" from-blue-50/90 to-cyan-50/70 dark:from-gray-800/95 dark:to-blue-900/20 rounded-3xl border border-blue-200/40 dark:border-gray-700/30 p-8 backdrop-blur-sm shadow-xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-blue-500/10 dark:bg-blue-400/10 rounded-2xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white text-xl tracking-tight">Academic Information</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Enrollment and academic timeline</p>
                </div>
              </div>
              <div className="grid gap-4">
                {student.SchoolEnterDate && (
                  <div className="bg-white/85 dark:bg-gray-900/50 rounded-xl p-4 border border-blue-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                        <span className="text-sm">🏫</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">School Entry</div>
                        <div className="font-bold text-gray-900 dark:text-white">{formatDate(student.SchoolEnterDate)}</div>
                      </div>
                    </div>
                  </div>
                )}
                {student.DistrictEnterDate && (
                  <div className="bg-white/85 dark:bg-gray-900/50 rounded-xl p-4 border border-blue-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <span className="text-sm">🏢</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">District Entry</div>
                        <div className="font-bold text-gray-900 dark:text-white">{formatDate(student.DistrictEnterDate)}</div>
                      </div>
                    </div>
                  </div>
                )}
                {student.NextGrade && (
                  <div className="bg-white/85 dark:bg-gray-900/50 rounded-xl p-4 border border-blue-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                        <span className="text-sm">⬆️</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Next Grade Level</div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          {student.NextGradeLevelLongDescription || `Grade ${student.NextGrade}`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {student.Track && student.Track.trim() && (
                  <div className="bg-white/85 dark:bg-gray-900/50 rounded-xl p-4 border border-blue-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                        <span className="text-sm">🏃</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Academic Track</div>
                        <div className="font-bold text-gray-900 dark:text-white">{student.Track}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Emergency Contacts */}
            {contacts && contacts.length > 0 && (
              <div className=" from-orange-50/90 to-amber-50/70 dark:from-gray-800/95 dark:to-orange-900/20 rounded-3xl border border-orange-200/40 dark:border-gray-700/30 p-8 backdrop-blur-sm shadow-xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-orange-500/10 dark:bg-orange-400/10 rounded-2xl flex items-center justify-center">
                    <Users className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-xl tracking-tight">Emergency Contacts</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} on file</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {contacts.map((c, idx) => (
                    <div key={`${c.SequenceNumber || idx}`} className="group bg-white/85 dark:bg-gray-900/50 rounded-2xl p-6 border border-orange-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-gray-900 dark:text-white text-lg">
                              {(c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : (c.MailingName || 'Contact')}
                            </h5>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <CopyButton value={(c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : (c.MailingName || 'Contact')} label="contact name" />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {c.RelationshipToStudentCode && (
                              <span className="text-xs px-3 py-1 bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full font-semibold">
                                {c.RelationshipToStudentCode}
                              </span>
                            )}
                            <span className="text-xs px-3 py-1 bg-gray-100/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-400 rounded-full font-medium">
                              Priority #{c.SequenceNumber ?? idx + 1}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-3">
                        {(c.HomePhone || c.WorkPhone || c.CellPhone) && (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-sm">📞</span>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Phone Numbers</div>
                              <div className="flex items-center gap-2">
                                <div className="font-mono text-sm text-gray-900 dark:text-white">
                                  {[c.HomePhone && `Home: ${c.HomePhone}`, c.WorkPhone && `Work: ${c.WorkPhone}`, c.CellPhone && `Cell: ${c.CellPhone}`].filter(Boolean).join(' • ')}
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <CopyButton value={[c.HomePhone, c.WorkPhone, c.CellPhone].filter(Boolean).join(' • ')} label="phone numbers" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {c.EmailAddress && (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Mail className="w-4 h-4 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Email</div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm text-gray-900 dark:text-white break-all">{c.EmailAddress}</div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                                  <CopyButton value={c.EmailAddress} label="email" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {(c.Address || c.AddressCity) && (
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-sm">🏠</span>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Address</div>
                              <div className="flex items-start gap-2">
                                <div className="text-sm text-gray-900 dark:text-white leading-relaxed">
                                  {formatAddress(c.Address, c.AddressCity, c.AddressState, c.AddressZipCode, c.AddressZipExt)}
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0 mt-0.5">
                                  <CopyButton value={formatAddress(c.Address, c.AddressCity, c.AddressState, c.AddressZipCode, c.AddressZipExt)} label="address" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {typeof c.LivesWithStudentIndicator !== 'undefined' && c.LivesWithStudentIndicator !== '' && (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-sm">🏡</span>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Living Arrangement</div>
                              <div className="text-sm text-gray-900 dark:text-white">
                                {String(c.LivesWithStudentIndicator) === 'Y' ? 'Lives with student' : 'Does not live with student'}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Programs and Services */}
          {programs && programs.length > 0 && (
            <div className="mt-12  from-emerald-50/90 to-green-50/70 dark:from-gray-800/95 dark:to-emerald-900/20 rounded-3xl border border-emerald-200/40 dark:border-gray-700/30 p-8 backdrop-blur-sm shadow-xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500/10 dark:bg-emerald-400/10 rounded-2xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white text-xl tracking-tight">Programs & Services</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{programs.length} active program{programs.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {programs.map((p: any, idx: number) => (
                  <div key={idx} className="group bg-white/85 dark:bg-gray-900/50 rounded-2xl p-6 border border-emerald-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                      <div className="flex-1">
                        <h5 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">
                          {p.ProgramDescription || 'Program'}
                        </h5>
                        {p.ProgramCode && (
                          <span className="inline-block mt-2 text-xs px-3 py-1 bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold">
                            Code: {p.ProgramCode}
                          </span>
                        )}
                      </div>
                    </div>
                    {(p.EligibilityStartDate || p.ParticipationStartDate) && (
                      <div className="space-y-2">
                        {p.EligibilityStartDate && (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-blue-500/10 rounded-full flex items-center justify-center">
                              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-semibold">Eligible:</span> {formatDate(p.EligibilityStartDate)}
                            </span>
                          </div>
                        )}
                        {p.ParticipationStartDate && (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-green-500/10 rounded-full flex items-center justify-center">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-semibold">Active:</span> {formatDate(p.ParticipationStartDate)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Records - Expandable Sections */}
          {(tests && tests.length > 0) || (discipline && discipline.length > 0) || (fees && fees.length > 0) ? (
            <div className="mt-16 space-y-6">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Detailed Records</h3>
                <p className="text-gray-600 dark:text-gray-400">Comprehensive academic and administrative data</p>
              </div>

              {tests && tests.length > 0 && (
                <details className="group  from-indigo-50/90 to-purple-50/70 dark:from-gray-800/95 dark:to-indigo-900/20 rounded-3xl border border-indigo-200/40 dark:border-gray-700/30 backdrop-blur-sm shadow-lg">
                  <summary className="cursor-pointer p-8 font-bold text-gray-900 dark:text-white hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-3xl transition-all duration-200 flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-500/10 dark:bg-indigo-400/10 rounded-xl flex items-center justify-center">
                      <span className="text-xl">📊</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-xl tracking-tight">Test Records</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 font-normal">{tests.length} test record{tests.length !== 1 ? 's' : ''} available</div>
                    </div>
                    <div className="w-6 h-6 text-gray-400 group-open:rotate-90 transition-transform duration-200">
                      ▶️
                    </div>
                  </summary>
                  <div className="p-8 pt-0 space-y-4">
                    <div className="grid gap-4">
                      {tests.map((t, idx) => (
                        <div key={`${t.SequenceNumber || idx}`} className="bg-white/85 dark:bg-gray-900/50 rounded-2xl p-6 border border-indigo-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                            <div className="flex-1">
                              <h5 className="font-bold text-gray-900 dark:text-white text-lg">{t.TestDescription || t.TestID}</h5>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Part: {t.TestPart || 'Not specified'}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
                                <span className="text-xs">📅</span>
                              </div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(t.TestDate)}</span>
                            </div>
                          </div>
                          {Array.isArray(t.Scores) && t.Scores.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Scores</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {t.Scores.map((s: any, i: number) => (
                                  <div key={i} className="bg-indigo-50/70 dark:bg-gray-800/60 px-4 py-3 rounded-xl border border-indigo-200/50 dark:border-gray-700/40">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{s.Type}</div>
                                    <div className="font-bold text-gray-900 dark:text-white text-lg">{s.Score}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              )}

              {discipline && discipline.length > 0 && (
                <details className="group  from-red-50/90 to-pink-50/70 dark:from-gray-800/95 dark:to-red-900/20 rounded-3xl border border-red-200/40 dark:border-gray-700/30 backdrop-blur-sm shadow-lg">
                  <summary className="cursor-pointer p-8 font-bold text-gray-900 dark:text-white hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-3xl transition-all duration-200 flex items-center gap-4">
                    <div className="w-10 h-10 bg-red-500/10 dark:bg-red-400/10 rounded-xl flex items-center justify-center">
                      <span className="text-xl">⚠️</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-xl tracking-tight">Discipline Records</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 font-normal">{discipline.reduce((acc, d) => acc + (Array.isArray(d.Disciplines) ? d.Disciplines.length : 0), 0)} incident{discipline.reduce((acc, d) => acc + (Array.isArray(d.Disciplines) ? d.Disciplines.length : 0), 0) !== 1 ? 's' : ''} recorded</div>
                    </div>
                    <div className="w-6 h-6 text-gray-400 group-open:rotate-90 transition-transform duration-200">
                      ▶️
                    </div>
                  </summary>
                  <div className="p-8 pt-0 space-y-4">
                    <div className="grid gap-4">
                      {discipline.map((d, dIdx) => (
                        <div key={dIdx}>
                          {Array.isArray(d.Disciplines) && d.Disciplines.map((inc: any, i: number) => (
                            <div key={`${inc.SequenceNumber || i}`} className="bg-white/85 dark:bg-gray-900/50 rounded-2xl p-6 border border-red-200/50 dark:border-gray-700/40 backdrop-blur-sm shadow-sm">
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                                <div className="flex-1">
                                  <h5 className="font-bold text-gray-900 dark:text-white text-lg">
                                    Violation: {inc.ViolationCode1 || 'Not specified'}
                                  </h5>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-red-500/10 rounded-lg flex items-center justify-center">
                                    <span className="text-xs">📅</span>
                                  </div>
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(inc.IncidentDate)}</span>
                                </div>
                              </div>
                              {inc.Comment && (
                                <div className="bg-red-50/70 dark:bg-gray-800/60 rounded-xl p-4 border border-red-200/50 dark:border-gray-700/40">
                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Comments</div>
                                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{inc.Comment}</div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              )}

              {fees && fees.length > 0 && (
                <details className="group  from-amber-50/90 to-yellow-50/70 dark:from-gray-800/95 dark:to-amber-900/20 rounded-3xl border border-amber-200/40 dark:border-gray-700/30 backdrop-blur-sm shadow-lg">
                  <summary className="cursor-pointer p-8 font-bold text-gray-900 dark:text-white hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-3xl transition-all duration-200 flex items-center gap-4">
                    <div className="w-10 h-10 bg-amber-500/10 dark:bg-amber-400/10 rounded-xl flex items-center justify-center">
                      <span className="text-xl">💰</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-xl tracking-tight">Fees & Fines</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 font-normal">Financial obligations and payments</div>
                    </div>
                    <div className="w-6 h-6 text-gray-400 group-open:rotate-90 transition-transform duration-200">
                      ▶️
                    </div>
                  </summary>
                  <div className="p-8 pt-0">
                    {(() => {
                      const formatCurrency = (n: number | string | null | undefined) => {
                        const v = typeof n === 'string' ? Number(n) : (n ?? 0);
                        return v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
                      };
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
                      let totalCharged = 0, totalPaid = 0;
                      for (const r of rows) {
                        totalCharged += Number(r.AmountCharged || 0);
                        totalPaid += Number(r.AmountPaid || 0);
                      }
                      const totalBalance = totalCharged - totalPaid;
                      rows.sort((a, b) => {
                        const da = a.DateCharged ? new Date(a.DateCharged).getTime() : 0;
                        const db = b.DateCharged ? new Date(b.DateCharged).getTime() : 0;
                        return db - da;
                      });
                      return (
                        <div className="space-y-6">
                          {/* Financial Summary Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white/70 dark:bg-gray-900/50 rounded-2xl p-6 border border-gray-200/40 dark:border-gray-700/40 backdrop-blur-sm text-center">
                              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center mx-auto mb-3">
                                <span className="text-sm">💵</span>
                              </div>
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Total Charged</div>
                              <div className="font-bold text-gray-900 dark:text-white text-xl">{formatCurrency(totalCharged)}</div>
                            </div>
                            <div className="bg-white/70 dark:bg-gray-900/50 rounded-2xl p-6 border border-gray-200/40 dark:border-gray-700/40 backdrop-blur-sm text-center">
                              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center mx-auto mb-3">
                                <span className="text-sm">✓</span>
                              </div>
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Total Paid</div>
                              <div className="font-bold text-gray-900 dark:text-white text-xl">{formatCurrency(totalPaid)}</div>
                            </div>
                            <div className="bg-white/70 dark:bg-gray-900/50 rounded-2xl p-6 border border-gray-200/40 dark:border-gray-700/40 backdrop-blur-sm text-center">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-3 ${
                                totalBalance > 0 ? 'bg-red-500/10' : 'bg-green-500/10'
                              }`}>
                                <span className={`text-sm ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {totalBalance > 0 ? '⚠️' : '🚀'}
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Balance Due</div>
                              <div className={`font-bold text-xl ${
                                totalBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                              }`}>
                                {formatCurrency(totalBalance)}
                              </div>
                            </div>
                          </div>
                          {rows.length > 0 && (
                            <div className="space-y-3">
                              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Recent Transactions</div>
                              <div className="grid gap-3">
                                {rows.slice(0, 5).map((r, idx) => {
                                  const bal = Number(r.AmountCharged || 0) - Number(r.AmountPaid || 0);
                                  return (
                                    <div key={idx} className="bg-white/70 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200/40 dark:border-gray-700/40 backdrop-blur-sm">
                                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                                        <div className="flex-1">
                                          <div className="font-bold text-gray-900 dark:text-white">
                                            {r.FeeCode || 'Unspecified Fee'}
                                          </div>
                                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                            {r.DateCharged ? formatDate(r.DateCharged) : 'Date not specified'}
                                          </div>
                                        </div>
                                        <div className="flex gap-4 text-sm">
                                          <div className="text-center">
                                            <div className="text-xs text-gray-500 dark:text-gray-400">Charged</div>
                                            <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(r.AmountCharged)}</div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-xs text-gray-500 dark:text-gray-400">Paid</div>
                                            <div className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(r.AmountPaid)}</div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-xs text-gray-500 dark:text-gray-400">Balance</div>
                                            <div className={`font-semibold ${
                                              bal > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                            }`}>
                                              {formatCurrency(bal)}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {rows.length > 5 && (
                                <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4 p-3 bg-white/40 dark:bg-gray-900/40 rounded-xl border border-gray-200/30 dark:border-gray-700/30">
                                  ✨ {rows.length - 5} additional transaction{rows.length - 5 !== 1 ? 's' : ''} available
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </details>
              )}
            </div>
          ) : null}
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
          className="flex items-center gap-2 rounded-xl backdrop-blur-sm border-gray-200/60 dark:border-gray-700/60 hover:shadow-sm transition-all duration-200 px-4 py-2"
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
          <div className=" from-blue-50/80 to-indigo-50/60 dark:bg-gray-800 rounded-lg border border-blue-200/50 dark:border-gray-700 p-4 shadow-sm">
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
          <div className=" from-green-50/80 to-emerald-50/60 dark:bg-gray-800 rounded-lg border border-green-200/50 dark:border-gray-700 p-4 shadow-sm">
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
          <div className=" from-purple-50/80 to-pink-50/60 dark:bg-gray-800 rounded-lg border border-purple-200/50 dark:border-gray-700 p-4 shadow-sm">
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
            <div className=" from-orange-50/80 to-amber-50/60 dark:bg-gray-800 rounded-lg border border-orange-200/50 dark:border-gray-700 p-4 shadow-sm">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">Academic Terms</h4>
              <div className="grid gap-3">
                {terms.map((term: any, index: number) => (
                  <div key={index} className="bg-white/80 dark:bg-gray-900/40 border border-orange-200/60 dark:border-gray-700 rounded-lg p-3 shadow-sm">
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
          <div className=" from-indigo-50/80 to-blue-50/60 dark:bg-gray-800 rounded-lg border border-indigo-200/50 dark:border-gray-700 p-4 shadow-sm">
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
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 dark:text-gray-400 text-lg font-medium">Loading schools...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-900/30 border border-red-200/60 dark:border-red-800/60 rounded-xl p-4 backdrop-blur-sm shadow-sm">
        {error}
      </div>
    );
  }

  if (!schoolsData?.data || !Array.isArray(schoolsData.data)) {
    return (
      <div className="text-gray-600 dark:text-gray-400 text-center py-8 text-lg">No schools data available.</div>
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
            className="flex items-center gap-2 rounded-xl backdrop-blur-sm border-gray-200/60 dark:border-gray-700/60 hover:shadow-sm transition-all duration-200 px-4 py-2"
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
          Schools ({schoolsList.length} schools)
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2 rounded-xl backdrop-blur-sm border-gray-200/60 dark:border-gray-700/60 hover:shadow-sm transition-all duration-200 px-4 py-2"
        >
          {showRaw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showRaw ? 'Hide Raw Data' : 'View Raw Data'}
        </Button>
      </div>

      {showRaw ? (
        <pre className="bg-gray-50/80 dark:bg-gray-900/60 p-5 rounded-xl text-xs overflow-auto max-h-80 border border-gray-200/40 dark:border-gray-700/40 text-gray-800 dark:text-gray-200 backdrop-blur-sm shadow-sm">
          {JSON.stringify(schoolsData, null, 2)}
        </pre>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {schoolsList.map((school: any) => (
            <div
              key={school.SchoolCode}
              className="bg-white/85 dark:bg-gray-800/60 rounded-xl border border-blue-200/50 dark:border-gray-700/40 p-5 cursor-pointer hover:bg-white/95 dark:hover:bg-gray-800/80 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md hover:scale-[1.02]"
              onClick={() => setSelectedSchool(school)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h4 className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">
                      {school.Name}
                    </h4>
                    <span className="text-sm text-gray-500 dark:text-gray-400 bg-blue-100/80 dark:bg-gray-700/80 px-3 py-1 rounded-lg backdrop-blur-sm shadow-sm">
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
                      <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/20 px-2 py-1 rounded shadow-sm">
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
      <div className="grid gap-3">
        <Label htmlFor={field.name} className="text-gray-700 dark:text-gray-300 font-semibold text-sm uppercase tracking-wide">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <textarea
          id={field.name}
          className="min-h-[120px] rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-white/80 dark:bg-gray-800/80 p-4 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm shadow-sm"
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
      <div className="grid gap-3">
        <Label htmlFor={field.name} className="text-gray-700 dark:text-gray-300 font-semibold text-sm uppercase tracking-wide">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Select value={value} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="bg-white/80 dark:bg-gray-800/80 border-gray-200/60 dark:border-gray-700/60 text-gray-900 dark:text-gray-100 rounded-xl backdrop-blur-sm shadow-sm">
            <SelectValue placeholder="Select a school" />
          </SelectTrigger>
          <SelectContent className="bg-white/90 dark:bg-gray-800/90 border-gray-200/60 dark:border-gray-700/60 backdrop-blur-sm shadow-lg">
            {schools.map((s) => (
              <SelectItem
                key={String(s.SchoolCode)}
                value={String(s.SchoolCode)}
                className="text-gray-900 dark:text-gray-100 hover:bg-gray-100/80 dark:hover:bg-gray-700/80"
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
    <div className="grid gap-3">
      <Label htmlFor={field.name} className="text-gray-700 dark:text-gray-300 font-semibold text-sm uppercase tracking-wide">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Input
        id={field.name}
        type={field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        className="bg-white/80 dark:bg-gray-800/80 border-gray-200/60 dark:border-gray-700/60 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 rounded-xl backdrop-blur-sm shadow-sm px-4 py-3"
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
    <div className="rounded-2xl border border-gray-200/40 dark:border-gray-700/40 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm p-8 space-y-6 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="font-bold text-gray-900 dark:text-white text-xl tracking-tight">{op.label}</div>
      <form onSubmit={onSubmit} className="grid gap-6">
        {op.fields.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {op.fields.map((f) => (
              <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} schools={schools} />
            ))}
          </div>
        )}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
          >
            {loading ? 'Running...' : 'Run'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { setValues(initial); setResult(null); setError(null); }}
            className="border-gray-300/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold px-6 py-3 rounded-xl backdrop-blur-sm"
          >
            Reset
          </Button>
        </div>
      </form>
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-900/30 border border-red-200/60 dark:border-red-800/60 rounded-xl p-4 backdrop-blur-sm shadow-sm">
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
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">API Response</div>
              <pre className="bg-gray-50/80 dark:bg-gray-900/60 p-5 rounded-xl text-xs overflow-auto max-h-80 border border-gray-200/40 dark:border-gray-700/40 text-gray-800 dark:text-gray-200 backdrop-blur-sm shadow-sm">
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
      <div className="min-h-screen bg-gray-50/90 dark:bg-black/90 transition-colors duration-300">
        <Header />
        <div className="flex">
          <Sidebar
            activeSection={activeSection}
            onSectionChange={() => {}}
            userRole={userRole}
          />
          <main className="flex-1 p-8">
            <div className="space-y-8">
              <div className="text-center lg:text-left">
                <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Aeries Integration</h1>
                <p className="text-gray-600 dark:text-gray-400 text-lg">Interact with Aeries SIS API (Aeries access required)</p>
              </div>

              <div className="rounded-2xl border border-gray-200/40 dark:border-gray-800/40 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl p-8 shadow-sm">
                <Tabs defaultValue="connection" className="space-y-6">
                  <TabsList className="grid grid-cols-6 w-full bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/30 dark:border-gray-700/30 shadow-sm">
                    <TabsTrigger value="connection" className="data-[state=active]:bg-white/90 dark:data-[state=active]:bg-gray-700/90 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm font-semibold tracking-wide transition-all duration-200">Connection</TabsTrigger>
                    <TabsTrigger value="schools" className="data-[state=active]:bg-white/90 dark:data-[state=active]:bg-gray-700/90 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm font-semibold tracking-wide transition-all duration-200">Schools</TabsTrigger>
                    <TabsTrigger value="students" className="data-[state=active]:bg-white/90 dark:data-[state=active]:bg-gray-700/90 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm font-semibold tracking-wide transition-all duration-200">Students</TabsTrigger>
                    <TabsTrigger value="enrollment" className="data-[state=active]:bg-white/90 dark:data-[state=active]:bg-gray-700/90 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm font-semibold tracking-wide transition-all duration-200">Enrollment</TabsTrigger>
                    <TabsTrigger value="attendance" className="data-[state=active]:bg-white/90 dark:data-[state=active]:bg-gray-700/90 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm font-semibold tracking-wide transition-all duration-200">Attendance</TabsTrigger>
                    <TabsTrigger value="grades" className="data-[state=active]:bg-white/90 dark:data-[state=active]:bg-gray-700/90 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm font-semibold tracking-wide transition-all duration-200">Grades</TabsTrigger>
                  </TabsList>
                  {Object.entries(operations).map(([key, ops]) => (
                    <TabsContent key={key} value={key} className="space-y-6 pt-6">
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

              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50/70 dark:bg-gray-900/70 rounded-xl p-4 border border-gray-200/40 dark:border-gray-800/40 backdrop-blur-sm shadow-sm">
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
