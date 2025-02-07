'use client';

import { ClassGroupDetailsView } from "@/components/dashboard/roles/super-admin/class-group/ClassGroupDetailsView";

interface ViewClassGroupPageProps {
	params: {
		id: string;
	};
}

export default function ViewClassGroupPage({ params }: ViewClassGroupPageProps) {
	return (
		<div className="container mx-auto py-6">
			<ClassGroupDetailsView classGroupId={params.id} />
		</div>
	);
}