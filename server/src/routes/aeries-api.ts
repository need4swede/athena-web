import express from 'express';
import path from 'path';
import { spawn } from 'child_process';
import { authenticateToken } from '../middleware/auth';
import { getAeriesPermissions } from '../database';

const router = express.Router();

// Helper to run the Python executor script
const runPython = (resource: string, method: string, params: any = {}) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(process.cwd(), './athena/scripts/aeries_execute.py');
    const args = [
      scriptPath,
      '--resource', resource,
      '--method', method,
    ];

    const paramsString = JSON.stringify(params || {});
    if (paramsString && paramsString !== '{}') {
      args.push('--params', paramsString);
    }

    // Ensure env passes through Aeries env vars and python path
    const env = {
      ...process.env,
      PYTHONPATH: process.cwd(),
    };

    const py = spawn('python3', args, { env });
    let out = '';
    let err = '';

    py.stdout.on('data', (d) => (out += d.toString()));
    py.stderr.on('data', (d) => (err += d.toString()));
    py.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(err || `Python exited with code ${code}`));
      }
      try {
        const json = JSON.parse(out.trim());
        resolve(json);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${(e as Error).message}. Raw: ${out}`));
      }
    });
  });
};

// Admin/Super-admin only guard (similar to Google routes)
function normalize(str: string): string { return String(str || '').toLowerCase(); }

// Map requested resource/method to a required permission flag
function hasAeriesPermission(perms: any, resource: string, method: string): boolean {
  const r = normalize(resource);
  const m = normalize(method);

  // Base category routing
  if (r === 'schools') {
    // system info and get_school are school-level
    return !!perms.can_access_school_data;
  }

  if (r === 'students') {
    // Specific sub-categories
    if (m.includes('contacts')) return !!perms.can_view_emergency_contacts;
    if (m.includes('discipline')) return !!perms.can_view_disciplinary_records;
    if (m.includes('fees')) return !!perms.can_view_fines;
    if (m.includes('programs')) return !!(perms.can_view_programs || perms.can_view_academic_info);
    if (m.includes('tests')) return !!(perms.can_view_test_records || perms.can_view_academic_info);
    if (m.includes('picture')) return !!perms.can_view_picture;
    if (m.includes('groups')) return !!perms.can_view_groups;
    // Generic student fetch/update
    return !!perms.can_access_student_data;
  }

  if (r === 'grades' || r === 'attendance') {
    return !!perms.can_view_academic_info;
  }

  if (r === 'client') {
    if (m.includes('student_data') || m.includes('newly_enrolled')) return !!perms.can_access_student_data;
    // test_connection and other misc client endpoints require just enabled
    return !!perms.aeries_enabled;
  }

  // Default to requiring master enable at minimum
  return !!perms.aeries_enabled;
}

async function requireAeriesAccess(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  // Super admin bypass
  if (req.user.role === 'super_admin') return next();
  // Only admins are eligible for Aeries access per requirements
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const { resource, method } = req.params;
  try {
    const perms = await getAeriesPermissions(req.user.id);
    if (!perms || !perms.aeries_enabled) {
      return res.status(403).json({ error: 'Aeries access not enabled for this user' });
    }
    if (!hasAeriesPermission(perms, resource, method)) {
      return res.status(403).json({ error: 'Insufficient Aeries permissions for requested operation' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Permission check failed' });
  }
}

// Determine which student-related sections are allowed for the current permissions
function allowedStudentSections(perms: any): string[] {
  const sections: string[] = [];
  if (perms?.can_view_emergency_contacts) sections.push('contacts');
  if (perms?.can_view_programs || perms?.can_view_academic_info) sections.push('programs');
  if (perms?.can_view_test_records || perms?.can_view_academic_info) sections.push('tests');
  if (perms?.can_view_disciplinary_records) sections.push('discipline');
  if (perms?.can_view_fines) sections.push('fees');
  if (perms?.can_view_picture) sections.push('picture');
  if (perms?.can_view_groups) sections.push('groups');
  return sections;
}

// Sanitize student base fields according to permissions
function sanitizeStudentBase(student: Record<string, any>, perms: any): Record<string, any> {
  if (!student || typeof student !== 'object') return student;
  const copy: Record<string, any> = { ...student };

  // Contact info
  if (!perms?.can_view_contact_info) {
    const contactFields = [
      'StudentEmailAddress', 'ParentEmailAddress',
      'StudentMobilePhone', 'HomePhone', 'ParentHomePhone', 'ParentCellPhone', 'ParentWorkPhone',
      'NetworkLoginID'
    ];
    for (const f of contactFields) delete copy[f];
  }

  // Address info
  if (!perms?.can_view_address_info) {
    const addrFields = [
      'MailingAddress', 'MailingAddressCity', 'MailingAddressState', 'MailingAddressZip', 'MailingAddressZipExt',
      'ResidenceAddress', 'ResidenceAddressCity', 'ResidenceAddressState', 'ResidenceAddressZip', 'ResidenceAddressZipExt'
    ];
    for (const f of addrFields) delete copy[f];
  }

  // Student overview (name/grade/gender/dob) is included with can_access_student_data
  if (!(perms?.can_access_student_data || perms?.can_view_student_overview)) {
    const overviewFields = [
      'FirstName', 'LastName', 'MiddleName', 'NameSuffix',
      'LegalFirstName', 'LegalLastName', 'Nickname',
      'Grade', 'GradeLevel', 'GradeLevelLongDescription',
      'Gender', 'Birthdate', 'SchoolName', 'Status'
    ];
    for (const f of overviewFields) delete copy[f];
  }

  // Personal/demographic info
  if (!perms?.can_view_personal_info) {
    const personalFields = [
      'EthnicityCode', 'RaceCode1', 'RaceCode2', 'RaceCode3', 'RaceCode4', 'RaceCode5',
      'LanguageFluencyCode', 'HomeLanguageCode', 'ParentEdLevelCode'
    ];
    for (const f of personalFields) delete copy[f];
  }

  // Academic timeline (enrollment-related basics)
  if (!perms?.can_view_academic_info) {
    const academicFields = [
      'SchoolEnterDate', 'DistrictEnterDate', 'NextGrade', 'NextGradeLevelLongDescription', 'Track'
    ];
    for (const f of academicFields) delete copy[f];
  }

  return copy;
}

// Sanitize an Aeries API response payload based on permissions and route
function sanitizeAeriesResponse(perms: any, resource: string, method: string, result: any): any {
  const r = normalize(resource);
  const m = normalize(method);
  if (!result || typeof result !== 'object') return result;
  if (perms && perms.superAdmin) return result;

  // Only sanitize data payload; preserve meta fields
  const data = result.data;

  // Helper to sanitize objects/lists of base student records
  const sanitizeBase = (obj: any) => sanitizeStudentBase(obj, perms);
  const sanitizeList = (arr: any[]) => arr.map((o) => (typeof o === 'object' ? sanitizeBase(o) : o));

  if (r === 'students' && m === 'get_student') {
    if (data && typeof data === 'object') {
      // Combined shape { student, contacts?, tests?, ... }
      if ('student' in data) {
        const out: any = { ...data };
        out.student = sanitizeBase(out.student || {});
        if (!perms?.can_view_emergency_contacts) delete out.contacts;
        if (!(perms?.can_view_test_records || perms?.can_view_academic_info)) delete out.tests;
        if (!perms?.can_view_disciplinary_records) delete out.discipline;
        if (!perms?.can_view_fines) delete out.fees;
        if (!(perms?.can_view_programs || perms?.can_view_academic_info)) delete out.programs;
        if (!(perms?.can_view_picture || perms?.can_access_student_data)) delete out.picture;
        if (!(perms?.can_view_groups || perms?.can_access_student_data)) delete out.groups;
        return { ...result, data: out };
      }
      // Base student only (dict)
      return { ...result, data: sanitizeBase(data) };
    }
    // Base student list
    if (Array.isArray(data)) {
      return { ...result, data: sanitizeList(data) };
    }
  }

  if (r === 'client' && (m.includes('student_data') || m.includes('newly_enrolled'))) {
    if (Array.isArray(data)) {
      return { ...result, data: sanitizeList(data) };
    }
    if (data && typeof data === 'object') {
      return { ...result, data: sanitizeBase(data) };
    }
  }

  if (r === 'students' && m === 'get_students_by_grade') {
    if (Array.isArray(data)) {
      return { ...result, data: sanitizeList(data) };
    }
  }

  // Default: no changes
  return result;
}

// Read operations: GET /api/aeries/:resource/:method?query
router.get('/:resource/:method', authenticateToken, requireAeriesAccess, async (req: any, res: any) => {
  const { resource, method } = req.params;
  try {
    // Compute params and allowed sections for selective fetch
    let params: any = req.query || {};
    let perms: any = null;
    if (resource.toLowerCase() === 'students' && method.toLowerCase() === 'get_student') {
      // Fetch perms for sanitization and selective include
      if (req.user?.role === 'super_admin') {
        // Super admins get full sections
        perms = { aeries_enabled: true, can_access_student_data: true, can_view_student_overview: true, can_view_contact_info: true, can_view_address_info: true, can_view_emergency_contacts: true, can_view_academic_info: true, can_view_test_records: true, can_view_programs: true, can_view_picture: true, can_view_groups: true, can_view_fines: true, can_view_disciplinary_records: true };
      } else {
        perms = await getAeriesPermissions(req.user.id);
      }
      const sections = req.user?.role === 'super_admin' ? ['contacts','programs','tests','discipline','fees','picture','groups'] : allowedStudentSections(perms || {});
      params = { ...params, include_sections: sections, include_all: false };
    }

    const result = await runPython(resource, method, params);
    // Sanitize response payloads based on permissions
    const effectivePerms = req.user?.role === 'super_admin' ? { superAdmin: true } : (perms || (await getAeriesPermissions(req.user.id)));
    const sanitized = sanitizeAeriesResponse(effectivePerms || {}, resource, method, result);
    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ error: 'Aeries read failed', details: error instanceof Error ? error.message : String(error) });
  }
});

// Write operations: POST /api/aeries/:resource/:method with JSON body
router.post('/:resource/:method', authenticateToken, requireAeriesAccess, async (req: any, res: any) => {
  const { resource, method } = req.params;
  try {
    const result = await runPython(resource, method, req.body || {});
    // Sanitize in case any write ops echo data back (rare)
    let perms: any = null;
    try { perms = await getAeriesPermissions(req.user.id); } catch {}
    const sanitized = sanitizeAeriesResponse(perms || {}, resource, method, result);
    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ error: 'Aeries write failed', details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;

// Expose current user's Aeries permissions for UI gating (no super-admin requirement)
router.get('/permissions', authenticateToken, async (req: any, res: any) => {
  try {
    // Super admins implicitly have full access; report enabled=true
    if (req.user?.role === 'super_admin') {
      return res.json({
        user_id: req.user.id,
        aeries_enabled: true,
      });
    }

    const perms = await getAeriesPermissions(req.user.id);
    if (!perms) {
      return res.json({ user_id: req.user.id, aeries_enabled: false });
    }
    return res.json(perms);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch Aeries permissions' });
  }
});
