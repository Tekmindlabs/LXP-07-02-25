import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { AttendanceStatus, Prisma } from "@prisma/client";
import { startOfDay, endOfDay, subDays, startOfWeek, format } from "date-fns";
import { TRPCError } from "@trpc/server";

// Cache implementation
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}
const statsCache = new Map<string, CacheEntry<any>>();

export const attendanceRouter = createTRPCRouter({
    getByDateAndClass: protectedProcedure
      .input(z.object({
        date: z.date(),
        classId: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const { date, classId } = input;
        return ctx.prisma.attendance.findMany({
          where: {
            date: {
              gte: startOfDay(date),
              lte: endOfDay(date),
            },
            student: {
              classId: classId
            }
          },
          include: {
            student: {
              include: {
                user: true
              }
            }
          },
        });
      }),
  
    batchSave: protectedProcedure
      .input(z.object({
        records: z.array(z.object({
          studentId: z.string(),
          date: z.date(),
          status: z.nativeEnum(AttendanceStatus),
          notes: z.string().optional()
        }))
      }))
      .mutation(async ({ ctx, input }) => {
        const { records } = input;
        
        return ctx.prisma.$transaction(
          records.map(record =>
            ctx.prisma.attendance.upsert({
              where: {
                studentId_date: {
                  studentId: record.studentId,
                  date: record.date,
                }
              },
              update: {
                status: record.status,
                notes: record.notes,
              },
              create: {
                studentId: record.studentId,
                date: record.date,
                status: record.status,
                notes: record.notes,
              },
            })
          )
        );
      }),

getStats: protectedProcedure.query(async ({ ctx }) => {
    try {
        const cacheKey = `stats_${ctx.session.user.id}`;
        const cached = statsCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }

        const today = new Date();
        const weekStart = startOfWeek(today);

        // Optimized query using Prisma raw queries for better performance
        const [todayStats, weeklyStats, absentStudents, classStats] = await Promise.all([
            // Today's attendance stats
            ctx.prisma.$queryRaw<any[]>`
                SELECT 
                    COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as present_count,
                    COUNT(CASE WHEN status = 'ABSENT' THEN 1 END) as absent_count,
                    COUNT(*) as total_count
                FROM Attendance
                WHERE date >= ${startOfDay(today)} AND date <= ${endOfDay(today)}
            `,
            // Weekly attendance percentage
            ctx.prisma.$queryRaw<any[]>`
                SELECT 
                    COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) * 100.0 / COUNT(*) as percentage
                FROM Attendance
                WHERE date >= ${weekStart} AND date <= ${today}
            `,
            // Most absent students with details
            ctx.prisma.$queryRaw<any[]>`
                SELECT 
                    s.id as student_id,
                    u.name as student_name,
                    COUNT(*) as absence_count
                FROM Attendance a
                JOIN StudentProfile s ON a.studentId = s.id
                JOIN User u ON s.userId = u.id
                WHERE a.status = 'ABSENT'
                    AND a.date >= ${subDays(today, 30)}
                GROUP BY s.id, u.name
                ORDER BY absence_count DESC
                LIMIT 3
            `,
            // Class-wise attendance
            ctx.prisma.$queryRaw<any[]>`
                SELECT 
                    c.name as class_name,
                    COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) * 100.0 / COUNT(*) as attendance_percentage
                FROM Attendance a
                JOIN StudentProfile s ON a.studentId = s.id
                JOIN Class c ON s.classId = c.id
                WHERE a.date = ${today}
                GROUP BY c.name
                ORDER BY attendance_percentage ASC
                LIMIT 3
            `
        ]);

        const result = {
            todayStats: {
                present: Number(todayStats[0]?.present_count) || 0,
                absent: Number(todayStats[0]?.absent_count) || 0,
                total: Number(todayStats[0]?.total_count) || 0
            },
            weeklyPercentage: Number(weeklyStats[0]?.percentage) || 0,
            mostAbsentStudents: absentStudents.map(student => ({
                name: student.student_name,
                absences: Number(student.absence_count)
            })),
            lowAttendanceClasses: classStats.map(cls => ({
                name: cls.class_name,
                percentage: Number(cls.attendance_percentage)
            }))
        };

        // Update cache
        statsCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error('Failed to fetch attendance stats:', error);
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch attendance statistics',
            cause: error
        });
    }
}),


getDashboardData: protectedProcedure.query(async ({ ctx }) => {
    try {
        const cacheKey = `dashboard_${ctx.session.user.id}`;
        const cached = statsCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }

        const today = new Date();
        const lastWeek = subDays(today, 7);

        // Optimized queries for dashboard data
        const [trendData, classAttendance] = await Promise.all([
            ctx.prisma.$queryRaw<any[]>`
                SELECT 
                    DATE(date) as date,
                    COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) * 100.0 / COUNT(*) as percentage
                FROM Attendance
                WHERE date >= ${lastWeek} AND date <= ${today}
                GROUP BY DATE(date)
                ORDER BY date ASC
            `,
            ctx.prisma.$queryRaw<any[]>`
                SELECT 
                    c.name as className,
                    COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_count,
                    COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_count
                FROM Attendance a
                JOIN StudentProfile s ON a.studentId = s.id
                JOIN Class c ON s.classId = c.id
                WHERE a.date >= ${lastWeek} AND date <= ${today}
                GROUP BY c.name
            `
        ]);

        const result = {
            attendanceTrend: trendData.map(record => ({
                date: format(record.date, 'yyyy-MM-dd'),
                percentage: Number(record.percentage) || 0
            })),
            classAttendance: classAttendance.map(record => ({
                className: record.className,
                present: Number(record.present_count),
                absent: Number(record.absent_count),
                percentage: (Number(record.present_count) * 100) / 
                    (Number(record.present_count) + Number(record.absent_count)) || 0
            }))
        };

        // Update cache
        statsCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch dashboard data',
            cause: error
        });
    }
})

});