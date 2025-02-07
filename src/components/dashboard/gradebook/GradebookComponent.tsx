import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import { ActivityWithBasicSubmissions } from "@/types/class-activity";

interface GradebookProps {
	classId: string;
	type?: 'student' | 'teacher';
}


export const GradebookComponent: React.FC<GradebookProps> = ({ classId, type }) => {
	const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'grades'>('overview');
	const { data: activities, isLoading, error } = api.classActivity.getAll.useQuery({
		classId,
	}) as { data: ActivityWithBasicSubmissions[] | undefined, isLoading: boolean, error: Error | null };

	if (isLoading) {
		return <div>Loading...</div>;
	}

	if (error) {
		return <div>Error loading gradebook: {error.message}</div>;
	}

	return (
		<div className="space-y-4">
			<Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="activities">Activities</TabsTrigger>
					<TabsTrigger value="grades">Grades</TabsTrigger>
				</TabsList>
				<TabsContent value="overview">
					{/* Overview content */}
				</TabsContent>
				<TabsContent value="activities">
					{activities?.map(activity => (
						<div key={activity.id} className="mb-4">
							<h3>{activity.title}</h3>
							<p>Submissions: {activity.submissions?.length || 0}</p>
						</div>
					))}
				</TabsContent>
				<TabsContent value="grades">
					{/* Grades content */}
				</TabsContent>
			</Tabs>
		</div>
	);
};
