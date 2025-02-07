import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { Status } from "@prisma/client";
import { TRPCError } from "@trpc/server";

export const classRouter = createTRPCRouter({
	createClass: protectedProcedure
		.input(z.object({
			name: z.string(),
			classGroupId: z.string(), // Required field
			capacity: z.number(),
			status: z.enum([Status.ACTIVE, Status.INACTIVE, Status.ARCHIVED]).optional().default(Status.ACTIVE),
			description: z.string().optional(),
			academicYear: z.string().optional(),
			semester: z.string().optional(),
			classTutorId: z.string().optional(),
			teacherIds: z.array(z.string()).optional(),
		}))
		.mutation(async ({ ctx, input }) => {
			const { teacherIds, classTutorId, ...classData } = input;
			
			const newClass = await ctx.prisma.class.create({
				data: {
					...classData,
					...(teacherIds && {
						teachers: {
							create: teacherIds.map(teacherId => ({
								teacher: {
									connect: { id: teacherId }
								},
								isClassTutor: teacherId === classTutorId,
								status: Status.ACTIVE,
							})),
						},
					}),
				},
				include: {
					classGroup: {
						include: {
							program: true,
						},
					},
					teachers: {
						include: {
							teacher: {
								include: {
									user: true,
								},
							},
						},
					},
					students: {
						include: {
							user: true,
						},
					},
				},
			});

			return newClass;
		}),

	updateClass: protectedProcedure
		.input(z.object({
			id: z.string(),
			name: z.string().optional(),
			classGroupId: z.string(), // Required field
			capacity: z.number().optional(),
			status: z.enum([Status.ACTIVE, Status.INACTIVE, Status.ARCHIVED]).optional(),
			description: z.string().optional(),
			academicYear: z.string().optional(),
			semester: z.string().optional(),
			classTutorId: z.string().optional(),
			teacherIds: z.array(z.string()).optional(),
		}))
		.mutation(async ({ ctx, input }) => {
			const { id, teacherIds, classTutorId, ...data } = input;

			if (teacherIds) {
				await ctx.prisma.teacherClass.deleteMany({
					where: { classId: id },
				});

				if (teacherIds.length > 0) {
					await ctx.prisma.teacherClass.createMany({
						data: teacherIds.map(teacherId => ({
							classId: id,
							teacherId,
							isClassTutor: teacherId === classTutorId,
							status: Status.ACTIVE,
						})),
					});
				}
			}

			return ctx.prisma.class.update({
				where: { id },
				data,
				include: {
					classGroup: {
						include: {
							program: true,
						},
					},
					teachers: {
						include: {
							teacher: {
								include: {
									user: true,
								},
							},
						},
					},
					students: true,
				},
			});
		}),

	deleteClass: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input }) => {
			return ctx.prisma.class.delete({
				where: { id: input },
			});
		}),

	getClass: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			return ctx.prisma.class.findUnique({
				where: { id: input },
				include: {
					classGroup: {
						include: {
							program: true,
						},
					},
					teachers: {
						include: {
							teacher: {
								include: {
									user: true,
								},
							},
						},
					},
					students: true,
					activities: true,
					timetables: {
						include: {
							periods: true,
						},
					},
				},
			});
		}),

	searchClasses: protectedProcedure
		.input(z.object({
			classGroupId: z.string().optional(), // Make it optional
			search: z.string().optional(),
			teacherId: z.string().optional(),
			status: z.enum([Status.ACTIVE, Status.INACTIVE, Status.ARCHIVED]).optional(),
		}))
		.query(async ({ ctx, input }) => {
			const { search, classGroupId, teacherId, status } = input;

			return ctx.prisma.class.findMany({
				where: {
					...(search && {
						OR: [
							{ name: { contains: search, mode: 'insensitive' } },
						],
					}),
					...(classGroupId && { classGroupId }),
					...(teacherId && {
						teachers: {
							some: { teacherId },
						},
					}),
					...(status && { status }),
				},
				include: {
					classGroup: {
						include: {
							program: true,
						},
					},
					teachers: {
						include: {
							teacher: {
								include: {
									user: true,
								},
							},
						},
					},
					students: true,
				},
				orderBy: {
					name: 'asc',
				},
			});
		}),

	getClassDetails: protectedProcedure
		.input(z.object({
			id: z.string(),
		}))
		.query(async ({ ctx, input }) => {
			const classDetails = await ctx.prisma.class.findUnique({
				where: { id: input.id },
				include: {
					classGroup: {
						include: {
							program: true,
							calendar: {
								include: {
									events: true
								}
							}
						},
					},
					teachers: {
						include: {
							teacher: {
								include: {
									user: true,
								},
							},
						},
					},
					students: {
						include: {
							user: true,
						},
					},
					activities: {
						include: {
							submissions: true,
						},
					},
					timetables: {
						include: {
							periods: true,
						},
					},
				},
			});

			if (!classDetails) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Class not found',
				});
			}

			return classDetails;
		}),


	list: protectedProcedure
		.query(async ({ ctx }) => {
			console.log('List Classes - Session:', ctx.session);
			
			// Check user roles and permissions
			const userRoles = ctx.session?.user?.roles || [];
			const hasAccess = userRoles.some(role => 
				['ADMIN', 'SUPER_ADMIN', 'TEACHER'].includes(role)
			);

			if (!hasAccess) {
				throw new TRPCError({
					code: 'UNAUTHORIZED',
					message: 'You do not have permission to access class list'
				});
			}

			try {
				// For teachers, only return their assigned classes
				if (userRoles.includes('TEACHER') && !userRoles.some(role => ['ADMIN', 'SUPER_ADMIN'].includes(role))) {
					return ctx.prisma.class.findMany({
						where: {
							teachers: {
								some: {
									teacher: {
										userId: ctx.session.user.id
									}
								}
							}
						},
						include: {
							classGroup: true,
							students: true,
							teachers: {
								include: {
									teacher: true,
								},
							},
							timetables: {
								include: {
									periods: {
										include: {
											subject: true,
											classroom: true,
										},
									},
								},
							},
							activities: true,
						},
					});
				}

				// For admin and super_admin, return all classes
				return ctx.prisma.class.findMany({
					include: {
						classGroup: true,
						students: true,
						teachers: {
							include: {
								teacher: true,
							},
						},
						timetables: {
							include: {
								periods: {
									include: {
										subject: true,
										classroom: true,
									},
								},
							},
						},
						activities: true,
					},
				});
			} catch (error) {
				console.error('Error fetching classes:', error);
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to fetch classes',
					cause: error,
				});
			}
		}),

	getById: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			return ctx.prisma.Class.findUnique({
				where: { id: input },
				include: {
					classGroup: true,
					students: true,
					teachers: {
						include: {
							teacher: {
								include: {
									user: true,
								},
							},
						},
					},
					timetables: {
						include: {
							periods: {
								include: {
									subject: true,
									classroom: true,
									teacher: {
										include: {
											user: true,
										},
									},
								},
							},
						},
					},
					activities: {
						include: {
							submissions: true,
						},
					},
				},
			});
		}),

	search: protectedProcedure
		.input(z.object({
			search: z.string().optional(),
			status: z.enum([Status.ACTIVE, Status.INACTIVE, Status.ARCHIVED]).optional(),
			classGroupId: z.string().optional(),
			teachers: z.object({
				some: z.object({
					teacherId: z.string(),
				}),
			}).optional(),
		}))
		.query(({ ctx, input }) => {
			const { search, ...filters } = input;
			return ctx.prisma.Class.findMany({
				where: {
					...filters,
					...(search && {
						OR: [
							{ name: { contains: search, mode: 'insensitive' } },
						],
					}),
				},
				include: {
					classGroup: true,
					timetables: {
						include: {
							periods: {
								include: {
									subject: true,
									classroom: true,
									teacher: {
										include: {
											user: true,
										},
									},
								},
							},
						},
					},
				},
			});
		}),

	getTeacherClasses: protectedProcedure
		.query(async ({ ctx }) => {
			const userId = ctx.session?.user?.id;
			if (!userId) return [];

			return ctx.prisma.Class.findMany({
				where: {
					teachers: {
						some: {
							teacher: {
								userId: userId
							}
						}
					}
				},
				include: {
					classGroup: true,
					teachers: {
						include: {
							teacher: {
								include: {
									user: true
								}
							}
						}
					}
				}
			});
		}),

	getStudents: protectedProcedure
		.input(z.object({
			classId: z.string()
		}))
		.query(async ({ ctx, input }) => {
			return ctx.prisma.studentProfile.findMany({
				where: {
					classId: input.classId
				},
				include: {
					user: true
				}
			});
		}),
});
