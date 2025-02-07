'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

interface GradeActivityModalProps {
	activityId: string;
	isOpen: boolean;
	onClose: () => void;
}

export function GradeActivityModal({ activityId, isOpen, onClose }: GradeActivityModalProps) {
	const { toast } = useToast();
	const [grades, setGrades] = useState<Record<string, { obtained: number; total: number; feedback?: string }>>({});

	// Fetch activity details and student submissions
	const { data: activity } = api.classActivity.getById.useQuery(
		{ id: activityId },
		{ enabled: isOpen }
	);

	const utils = api.useContext();

	// Mutation for saving grades
	const gradeMutation = api.gradebook.gradeActivity.useMutation({
		onSuccess: () => {
			toast({
				title: "Success",
				description: "Grades saved successfully",
			});
			utils.classActivity.getById.invalidate(activityId);
			onClose();
		},
		onError: (error) => {
			toast({
				title: "Error",
				description: error.message,
				variant: "destructive",
			});
		},
	});

	const handleGradeChange = (studentId: string, field: 'obtained' | 'total' | 'feedback', value: string) => {
		setGrades(prev => ({
			...prev,
			[studentId]: {
				...prev[studentId],
				[field]: field === 'feedback' ? value : Number(value)
			}
		}));
	};

	const handleSaveGrades = async () => {
		try {
			await Promise.all(
				Object.entries(grades).map(([studentId, grade]) =>
					gradeMutation.mutateAsync({
						activityId,
						studentId,
						obtainedMarks: grade.obtained,
						totalMarks: grade.total,
						feedback: grade.feedback,
					})
				)
			);
		} catch (error) {
			console.error('Error saving grades:', error);
		}
	};

	if (!activity) return null;

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>Grade Activity: {activity.title}</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Student</TableHead>
								<TableHead>Obtained Marks</TableHead>
								<TableHead>Total Marks</TableHead>
								<TableHead>Feedback</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{activity.submissions?.map((submission) => (
								<TableRow key={submission.studentId}>
									<TableCell>{submission.student.user.name}</TableCell>
									<TableCell>
										<Input
											type="number"
											min={0}
											value={grades[submission.studentId]?.obtained ?? submission.obtainedMarks ?? ''}
											onChange={(e) => handleGradeChange(submission.studentId, 'obtained', e.target.value)}
											className="w-20"
										/>
									</TableCell>
									<TableCell>
										<Input
											type="number"
											min={0}
											value={grades[submission.studentId]?.total ?? submission.totalMarks ?? ''}
											onChange={(e) => handleGradeChange(submission.studentId, 'total', e.target.value)}
											className="w-20"
										/>
									</TableCell>
									<TableCell>
										<Textarea
											placeholder="Add feedback..."
											value={grades[submission.studentId]?.feedback ?? submission.feedback ?? ''}
											onChange={(e) => handleGradeChange(submission.studentId, 'feedback', e.target.value)}
											className="h-20"
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>

					<div className="flex justify-end space-x-2">
						<Button variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button onClick={handleSaveGrades} disabled={gradeMutation.isLoading}>
							{gradeMutation.isLoading ? 'Saving...' : 'Save Grades'}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}