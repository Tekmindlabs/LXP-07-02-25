import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { Status } from "@prisma/client";
import { TRPCError } from "@trpc/server";

export const gradebookRouter = createTRPCRouter({
	getOverview: protectedProcedure
		.input(z.object({ classId: z.string() }))
		.query(async ({ ctx, input }) => {
			const activities = await ctx.prisma.classActivity.findMany({
				where: { classId: input.classId },
				include: {
					submissions: {
						include: {
							student: {
								include: {
									user: true
								}
							}
						}
					}
				}
			});

			const totalStudents = await ctx.prisma.studentProfile.count({
				where: { classId: input.classId }
			});

			let totalGrades = 0;
			let highestGrade = 0;
			let lowestGrade = 100;
			const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

			activities.forEach(activity => {
				activity.submissions.forEach(submission => {
					const grade = (submission.obtainedMarks / submission.totalMarks) * 100;
					totalGrades += grade;
					highestGrade = Math.max(highestGrade, grade);
					lowestGrade = Math.min(lowestGrade, grade);

					if (grade >= 90) gradeDistribution.A++;
					else if (grade >= 80) gradeDistribution.B++;
					else if (grade >= 70) gradeDistribution.C++;
					else if (grade >= 60) gradeDistribution.D++;
					else gradeDistribution.F++;
				});
			});

			const totalSubmissions = activities.reduce((acc, act) => acc + act.submissions.length, 0);
			const classAverage = totalSubmissions > 0 ? totalGrades / totalSubmissions : 0;

			return {
				classAverage,
				highestGrade,
				lowestGrade,
				distribution: gradeDistribution,
				totalStudents
			};
		}),

	getGrades: protectedProcedure
		.input(z.object({ classId: z.string() }))
		.query(async ({ ctx, input }) => {
			const students = await ctx.prisma.studentProfile.findMany({
				where: { classId: input.classId },
				include: {
					user: true,
					submissions: {
						include: {
							activity: true
						}
					}
				}
			});

			const studentGrades = students.map(student => {
				const grades = student.submissions.map(submission => ({
					activityId: submission.activityId,
					activityName: submission.activity.title,
					grade: submission.obtainedMarks,
					totalPoints: submission.totalMarks
				}));

				const totalPoints = grades.reduce((acc, grade) => acc + grade.grade, 0);
				const maxPoints = grades.reduce((acc, grade) => acc + grade.totalPoints, 0);
				const overallGrade = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;

				return {
					studentId: student.id,
					studentName: student.user.name,
					overallGrade,
					activityGrades: grades
				};
			});

			return { studentGrades };
		}),

	gradeActivity: protectedProcedure
		.input(z.object({
			activityId: z.string(),
			studentId: z.string(),
			obtainedMarks: z.number().min(0),
			totalMarks: z.number().min(0),
			feedback: z.string().optional(),
		}))
		.mutation(async ({ ctx, input }) => {
			// Verify user has permission to grade
			const userRole = await ctx.prisma.userRole.findFirst({
				where: {
					userId: ctx.session.user.id,
					role: {
						name: {
							in: ['TEACHER', 'ADMIN']
						}
					}
				}
			});

			if (!userRole) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'You do not have permission to grade activities',
				});
			}

			return ctx.prisma.activitySubmission.upsert({
				where: {
					activityId_studentId: {
						activityId: input.activityId,
						studentId: input.studentId,
					}
				},
				update: {
					obtainedMarks: input.obtainedMarks,
					totalMarks: input.totalMarks,
					feedback: input.feedback,
					gradedBy: ctx.session.user.id,
					gradedAt: new Date(),
					status: Status.GRADED,
				},
				create: {
					activityId: input.activityId,
					studentId: input.studentId,
					obtainedMarks: input.obtainedMarks,
					totalMarks: input.totalMarks,
					feedback: input.feedback,
					gradedBy: ctx.session.user.id,
					gradedAt: new Date(),
					status: Status.GRADED,
				},
			});
		}),
});