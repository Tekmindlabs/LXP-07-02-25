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
	const utils = api.useContext();

	// Fetch activity details and student submissions
	const { data: activity, isLoading, error } = api.classActivity.getById.useQuery(
		activityId,
		{ enabled: isOpen }
	);

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
		setGrades(prev => {
			const currentGrade = prev[studentId] || { obtained: 0, total: 0 };
			const numValue = field === 'feedback' ? value : (value === '' ? 0 : Number(value));

			// If updating obtained marks, ensure it doesn't exceed total
			if (field === 'obtained' && typeof numValue === 'number' && numValue > currentGrade.total) {
				toast({
					title: "Error",
					description: "Obtained marks cannot exceed total marks",
					variant: "destructive",
				});
				return prev;
			}

			// If updating total marks, ensure it's not less than obtained
			if (field === 'total' && typeof numValue === 'number' && numValue < currentGrade.obtained) {
				toast({
					title: "Error",
					description: "Total marks cannot be less than obtained marks",
					variant: "destructive",
				});
				return prev;
			}

			return {
				...prev,
				[studentId]: {
					...currentGrade,
					[field]: numValue
				}
			};
		});
	};

	const handleSaveGrades = async () => {
		try {
			const validGrades = Object.entries(grades).filter(
				([_, grade]) => typeof grade.obtained === 'number' && 
							   typeof grade.total === 'number' &&
							   !isNaN(grade.obtained) && 
							   !isNaN(grade.total) &&
							   grade.total > 0 &&
							   grade.obtained <= grade.total
			);

			if (validGrades.length === 0) {
				toast({
					title: "Error",
					description: "Please enter valid marks for at least one student. Ensure obtained marks don't exceed total marks.",
					variant: "destructive",
				});
				return;
			}

			await Promise.all(
				validGrades.map(([studentId, grade]) =>
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

	// Loading state
	if (isLoading) {
		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Loading...</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	// Error state
	if (error) {
		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Error loading activity</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	// No activity state
	if (!activity) {
		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Activity not found</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

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
									<TableCell>{submission.student?.name ?? 'Unknown Student'}</TableCell>
									<TableCell>
										<Input
											type="number"
											min={0}
											value={grades[submission.studentId]?.obtained ?? submission.obtainedMarks ?? ''}
											onChange={(e) => handleGradeChange(submission.studentId, 'obtained', e.target.value)}
											className={`w-20 ${
												grades[submission.studentId]?.obtained > grades[submission.studentId]?.total 
												? 'border-red-500' 
												: ''
											}`}
										/>
									</TableCell>
									<TableCell>
										<Input
											type="number"
											min={0}
											value={grades[submission.studentId]?.total ?? submission.totalMarks ?? ''}
											onChange={(e) => handleGradeChange(submission.studentId, 'total', e.target.value)}
											className={`w-20 ${
												grades[submission.studentId]?.total < grades[submission.studentId]?.obtained 
												? 'border-red-500' 
												: ''
											}`}
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