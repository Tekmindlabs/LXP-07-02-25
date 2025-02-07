'use client';

import { ClassGroupForm } from "@/components/dashboard/roles/super-admin/class-group/ClassGroupForm";
import { api } from "@/utils/api";

interface EditClassGroupPageProps {
	params: {
		id: string;
	};
}

export default function EditClassGroupPage({ params }: EditClassGroupPageProps) {
	const { data: classGroup, isLoading } = api.classGroup.getClassGroup.useQuery(params.id);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
			</div>
		);
	}

	if (!classGroup) {
		return (
			<div className="p-4 text-center">
				<p className="text-destructive">Failed to load class group details.</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-6">
			<h1 className="text-2xl font-bold mb-6">Edit Class Group</h1>
			<ClassGroupForm 
				selectedClassGroup={{
					id: classGroup.id,
					name: classGroup.name,
					description: classGroup.description || "",
					programId: classGroup.programId,
					status: classGroup.status,
					calendarId: classGroup.calendarId
				}}
				onSuccess={() => {
					window.location.href = `/dashboard/super-admin/class-group`;
				}}
			/>
		</div>
	);
}