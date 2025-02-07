import { DefaultRoles } from "@/utils/permissions";
import { DashboardFeature } from "@/types/dashboard";

export const DashboardFeatures: Record<keyof typeof DefaultRoles, DashboardFeature[]> = {
  "SUPER_ADMIN": [
    'system-metrics',
    'user-management',
    'role-management',
    'audit-logs',
    'advanced-settings',
    'academic-calendar',
    'timetable-management',
    'classroom-management',
    'class-activity-management',
    'knowledge-base'
  ],
  "ADMIN": [
    'user-management',
    'audit-logs',
    'timetable-management',
    'classroom-management',
    'class-activity-management',
    'knowledge-base'
  ],
  "PROGRAM_COORDINATOR": [
    'class-management',
    'student-progress',
    'timetable-management',
    'class-activity-management',
    'knowledge-base'
  ],
  "TEACHER": [
    'class-management',
    'student-progress',
    'assignments',
    'grading',
    'class-activity-management',
    'knowledge-base'
  ],
  "STUDENT": [
    'assignments',
    'student-progress',
    'class-activities',
    'knowledge-base'
  ],
  "PARENT": [
    'student-progress',
    'class-activities'
  ]
};