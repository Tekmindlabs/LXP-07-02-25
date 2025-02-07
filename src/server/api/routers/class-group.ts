import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { Status } from "@prisma/client";
import { TRPCError } from "@trpc/server";

const calendarSchema = z.object({
	id: z.string(),
	inheritSettings: z.boolean().optional(),
});

export const classGroupRouter = createTRPCRouter({
	create: protectedProcedure
		.input(z.object({
			name: z.string(),
			description: z.string().optional(),
			programId: z.string(),
			status: z.enum([Status.ACTIVE, Status.INACTIVE, Status.ARCHIVED]).default(Status.ACTIVE),
			calendar: calendarSchema,
		}))
		.mutation(async ({ ctx, input }) => {
			const { calendar, ...classGroupData } = input;

			return ctx.prisma.$transaction(async (tx) => {
				const classGroup = await tx.classGroup.create({
					data: {
						...classGroupData,
						calendarId: calendar.id,
					},
					include: {
						classes: true,
						calendar: true,
					}
				});

				return classGroup;
			});
		}),

	update: protectedProcedure

		.input(z.object({
		  id: z.string(),
		  name: z.string().optional(),
		  description: z.string().optional(),
		  programId: z.string().optional(),
		  status: z.enum([Status.ACTIVE, Status.INACTIVE, Status.ARCHIVED]).optional(),
		  calendar: calendarSchema.optional(),
		}))
		.mutation(async ({ ctx, input }) => {
		  const { id, calendar, ...data } = input;

		  return ctx.prisma.$transaction(async (tx) => {
			const classGroup = await tx.classGroup.update({
			  where: { id },
			  data: {
				...data,
				...(calendar && { calendarId: calendar.id }),
			  },
			  include: {
				classes: true,
				calendar: true,
			  }
			});

			return classGroup;
		  });
		}),


	deleteClassGroup: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input }) => {
			return ctx.prisma.classGroup.delete({
				where: { id: input },
			});
		}),

	getClassGroup: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			return ctx.prisma.classGroup.findUnique({
				where: { id: input },
				include: {
					program: true,
					subjects: true,
					classes: true,
					timetables: true,
				},
			});
		}),

	getAllClassGroups: protectedProcedure
		.input(z.object({
			programId: z.string().optional(),
		}).optional())
		.query(async ({ ctx, input }) => {
			return ctx.prisma.classGroup.findMany({
				where: input ? { programId: input.programId } : undefined,
				include: {
					program: true,
					subjects: true,
					classes: true,
					calendar: true,
				},
				orderBy: {
					name: 'asc',
				},
			});
		}),

	getByProgramId: protectedProcedure
		.input(z.object({
			programId: z.string().min(1, "Program ID is required")
		}))
		.query(async ({ ctx, input }) => {
			try {
				// First check if program exists
				const program = await ctx.prisma.program.findUnique({
					where: { id: input.programId }
				});

				if (!program) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Program not found",
					});
				}

				const classGroups = await ctx.prisma.classGroup.findMany({
					where: { programId: input.programId },
					include: {
						classes: {
							include: {
								students: true,
								teachers: true,
							},
						},
						program: true,
						subjects: true,
					},
					orderBy: {
						name: 'asc'
					}
				});

				return classGroups;
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch class groups",
					cause: error,
				});
			}
		}),

	addSubjectsToClassGroup: protectedProcedure
		.input(z.object({
			classGroupId: z.string(),
			subjectIds: z.array(z.string()),
		}))
		.mutation(async ({ ctx, input }) => {
			const classGroup = await ctx.prisma.classGroup.update({
				where: { id: input.classGroupId },
				data: {
					subjects: {
						connect: input.subjectIds.map(id => ({ id })),
					},
				},
				include: {
					subjects: true,
				},
			});
			return classGroup;
		}),

	removeSubjectsFromClassGroup: protectedProcedure
		.input(z.object({
			classGroupId: z.string(),
			subjectIds: z.array(z.string()),
		}))
		.mutation(async ({ ctx, input }) => {
			const classGroup = await ctx.prisma.classGroup.update({
				where: { id: input.classGroupId },
				data: {
					subjects: {
						disconnect: input.subjectIds.map(id => ({ id })),
					},
				},
				include: {
					subjects: true,
				},
			});
			return classGroup;
		}),

	getClassGroupWithDetails: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			return ctx.prisma.ClassGroup.findUnique({
				where: { id: input },
				include: {
					program: {
						include: {
							classGroups: {
								include: {
									timetables: {
										include: {
											term: {
												include: {
													calendar: true,
												},
											},
										},
									},
								},
							},
						},
					},
					subjects: true,
					classes: {
						include: {
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
						},
					},
					timetables: {
						include: {
							term: {
								include: {
									calendar: true,
								},
							},
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
		}),

	addSubjects: protectedProcedure
		.input(z.object({
			classGroupId: z.string(),
			subjectIds: z.array(z.string()),
		}))
		.mutation(async ({ ctx, input }) => {
			const { classGroupId, subjectIds } = input;

			// Add subjects to class group
			const classGroup = await ctx.prisma.classGroup.update({
				where: { id: classGroupId },
				data: {
					subjects: {
						connect: subjectIds.map(id => ({ id })),
					},
				},
				include: {
					subjects: true,
				},
			});

			// Inherit subjects to all classes in the group
			const classes = await ctx.prisma.Class.findMany({
				where: { classGroupId },
			});

			// Update timetable for each class if needed
			for (const cls of classes) {
				const timetable = await ctx.prisma.timetable.findFirst({
					where: { classId: cls.id }
				});

				if (timetable) {
					await ctx.prisma.Period.createMany({
						data: subjectIds.map(subjectId => ({
							timetableId: timetable.id,
							subjectId,
							teacherId: "", // This should be set to a valid teacher ID in production
							startTime: new Date(),
							endTime: new Date(),
							dayOfWeek: 1,
							classroomId: "" // This should be set to a valid classroom ID in production
						}))
					});
				}

			}

			return classGroup;
		}),

	removeSubjects: protectedProcedure
		.input(z.object({
			classGroupId: z.string(),
			subjectIds: z.array(z.string()),
		}))
		.mutation(async ({ ctx, input }) => {
			const { classGroupId, subjectIds } = input;

			// Remove subjects from class group
			return ctx.prisma.ClassGroup.update({
				where: { id: classGroupId },
				data: {
					subjects: {
						disconnect: subjectIds.map(id => ({ id })),
					},
				},
				include: {
					subjects: true,
				},
			});
		}),

	inheritCalendar: protectedProcedure
		.input(z.object({
			classGroupId: z.string(),
			calendarId: z.string(),
			classId: z.string(), // Required for timetable creation
		}))
		.mutation(async ({ ctx, input }) => {
			const { classGroupId, calendarId, classId } = input;

			// Get the calendar and its terms
			const calendar = await ctx.prisma.Calendar.findUnique({
				where: { id: calendarId },
				include: {
					terms: true,
				},
			});

			if (!calendar) {
				throw new Error("Calendar not found");
			}

			// Create a timetable for the class group using the first term
			const term = calendar.terms[0];
			if (!term) {
				throw new Error("No terms found in calendar");
			}

			const timetable = await ctx.prisma.Timetable.create({
				data: {
					termId: term.id,
					classGroupId,
					classId, // Add required classId
				},
			});

			return ctx.prisma.classGroup.findUnique({
				where: { id: classGroupId },
				include: {
					timetables: {
						include: {
							term: {
								include: {
									calendar: true,
								},
							},
						},
					},
				},
			});
		}),

	list: protectedProcedure
		.query(({ ctx }) => {
			return ctx.prisma.ClassGroup.findMany({
				include: {
					program: true,
					classes: true,
					subjects: true,
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
		}),

	getById: protectedProcedure
		.input(z.string())
		.query(async ({ ctx, input }) => {
			return ctx.prisma.classGroup.findUnique({
				where: { id: input },
				include: {
					program: true,
					classes: {
						include: {
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
					subjects: true,
					activities: true,
				},
			});
		}),

	createTimetable: protectedProcedure
		.input(z.object({
			classGroupId: z.string(),
			termId: z.string(),
			classId: z.string()
		}))
		.mutation(async ({ ctx, input }) => {
			const existingTimetable = await ctx.prisma.Timetable.findFirst({
				where: { classGroupId: input.classGroupId },
			});

			if (existingTimetable) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Timetable already exists for this class group",
				});
			}

			return ctx.prisma.timetable.create({
				data: {
					term: { connect: { id: input.termId } },
					classGroup: { connect: { id: input.classGroupId } },
					class: { connect: { id: input.classId } }
				},
				include: {
					periods: {
						include: {
							subject: true,
							classroom: true,
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
});