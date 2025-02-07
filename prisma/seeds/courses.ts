import { PrismaClient, Status, CalendarType, Visibility } from '@prisma/client';

export async function seedCourses(prisma: PrismaClient) {
	const program = await prisma.program.findFirst();
	if (!program) return;

	// First create or find existing calendar
	const calendar = await prisma.calendar.upsert({
		where: {
			name_type: {
				name: 'Academic Calendar 2025',
				type: CalendarType.SECONDARY
			}
		},
		update: {},  // No updates needed if it exists
		create: {
			name: 'Academic Calendar 2025',
			description: 'Calendar for Academic Year 2025',
			startDate: new Date('2025-01-01'),
			endDate: new Date('2025-12-31'),
			type: CalendarType.SECONDARY,
			status: Status.ACTIVE,
			visibility: Visibility.ALL,
		}
	});

	// Then create the class group with the calendar
	const classGroup = await prisma.classGroup.create({
		data: {
			name: 'Academic Year 2025',
			programId: program.id,
			calendarId: calendar.id,
			status: Status.ACTIVE,
		}
	});

	const classes = [
		{
			name: 'Foundation Year 2025',
			capacity: 30,
			status: Status.ACTIVE,
			classGroupId: classGroup.id,
		},
		{
			name: 'Advanced Studies 2025',
			capacity: 30,
			status: Status.ACTIVE,
			classGroupId: classGroup.id,
		},
		{
			name: 'Specialized Track 2025',
			capacity: 30,
			status: Status.ACTIVE,
			classGroupId: classGroup.id,
		}
	];

	for (const classData of classes) {
		await prisma.class.create({
			data: classData
		});
	}
}