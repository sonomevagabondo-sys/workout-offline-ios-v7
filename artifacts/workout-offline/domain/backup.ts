import { z } from 'zod';
import { WorkoutState } from '@/domain/workout';

export const WORKOUT_BACKUP_FORMAT = 'workout-offline-backup';
export const WORKOUT_BACKUP_VERSION = 1;

const DayTypeSchema = z.enum(['Upper', 'Lower', 'Rest']);

const WorkoutSetSchema = z.object({
  id: z.string().min(1),
  weight: z.string(),
  reps: z.string(),
}).passthrough();

const ExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: z.string().min(1),
  custom: z.boolean().optional(),
  targetSets: z.number().int().min(0),
  targetReps: z.number().int().min(0),
  sets: z.array(WorkoutSetSchema),
}).passthrough();

const WorkoutDaySchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1).max(7),
  name: z.string(),
  type: DayTypeSchema,
  exercises: z.array(ExerciseSchema),
  completed: z.boolean(),
  skipped: z.boolean(),
  completedOn: z.string().optional(),
}).passthrough();

const ProgramSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  cycleStart: z.string().min(1),
  cycleNumber: z.number().int().min(1),
  days: z.array(WorkoutDaySchema).length(7),
  nextCycleDays: z.array(WorkoutDaySchema).length(7).optional(),
}).passthrough();

const WorkoutLogSetSchema = z.object({
  exerciseName: z.string(),
  group: z.string(),
  setIndex: z.number().int().min(0),
  weight: z.number().finite().min(0),
  reps: z.number().int().min(0),
}).passthrough();

const WorkoutLogSchema = z.object({
  id: z.string().min(1),
  dayId: z.string().min(1),
  programId: z.string().min(1),
  completedOn: z.string().min(1),
  streakAfter: z.number().int().min(0),
  volume: z.number().finite().min(0),
  workoutName: z.string().optional(),
  unit: z.enum(['kg', 'lb']).optional(),
  xpEarned: z.number().finite().min(0).optional(),
  sets: z.array(WorkoutLogSetSchema).optional(),
}).passthrough();

const HistorySetSchema = z.object({
  dayOrder: z.number().int().min(1).max(7),
  dayName: z.string(),
  dayType: DayTypeSchema,
  exerciseName: z.string(),
  group: z.string(),
  setIndex: z.number().int().min(0),
  weight: z.number().finite().min(0),
  reps: z.number().int().min(0),
  completedOn: z.string().min(1),
}).passthrough();

const CycleHistorySchema = z.object({
  programId: z.string().optional(),
  cycleNumber: z.number().int().min(1),
  volume: z.number().finite().min(0),
  completedDays: z.number().int().min(0),
  totalTrainingDays: z.number().int().min(0),
  completedOn: z.string().min(1),
  sets: z.array(HistorySetSchema).optional(),
}).passthrough();

const CustomExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: z.string().min(1),
}).passthrough();

const WorkoutStateSchema = z.object({
  program: ProgramSchema,
  programs: z.array(ProgramSchema).optional(),
  activeProgramId: z.string().optional(),
  scheduledProgramId: z.string().optional(),
  totalXp: z.number().finite().min(0).optional(),
  streak: z.number().int().min(0).optional(),
  record: z.number().int().min(0).optional(),
  logs: z.array(WorkoutLogSchema).optional(),
  history: z.array(CycleHistorySchema).optional(),
  customExercises: z.array(CustomExerciseSchema).optional(),
  profileName: z.string().optional(),
  unit: z.enum(['kg', 'lb']).optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  streakLostNotice: z.boolean().optional(),
}).passthrough();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createWorkoutBackup(state: WorkoutState, exportedAt = new Date().toISOString()) {
  return {
    format: WORKOUT_BACKUP_FORMAT,
    version: WORKOUT_BACKUP_VERSION,
    app: 'Workout Offline',
    exportedAt,
    data: state,
  };
}

export function parseWorkoutBackup(json: string): WorkoutState {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json) as unknown;
  } catch {
    throw new Error('Il file selezionato non contiene un JSON valido.');
  }

  if (!isObject(parsedJson) || parsedJson.format !== WORKOUT_BACKUP_FORMAT) {
    throw new Error('Questo file non è un backup di Workout Offline.');
  }
  if (parsedJson.version !== WORKOUT_BACKUP_VERSION) {
    throw new Error(`Versione del backup non supportata (${String(parsedJson.version)}). Nessun dato è stato modificato.`);
  }
  if (!isObject(parsedJson.data)) {
    throw new Error('Il backup è incompleto: non contiene i dati dell’app.');
  }

  const result = WorkoutStateSchema.safeParse(parsedJson.data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    throw new Error(`Il backup è danneggiato o incompleto${location}. Nessun dato è stato modificato.`);
  }

  const data = result.data;
  const logs = data.logs ?? [];
  return {
    ...data,
    program: data.program,
    programs: data.programs?.length ? data.programs : [data.program],
    activeProgramId: data.activeProgramId ?? data.program.id,
    totalXp:
      data.totalXp ??
      logs.reduce((total, log) => total + (log.xpEarned ?? 0), 0),
    streak: data.streak ?? 0,
    record: data.record ?? 0,
    logs,
    history: (data.history ?? []).map((cycle) => ({
      ...cycle,
      sets: cycle.sets ?? [],
    })),
    customExercises: data.customExercises ?? [],
    profileName: data.profileName ?? '',
    unit: data.unit ?? 'kg',
    theme: data.theme ?? 'dark',
    streakLostNotice: data.streakLostNotice ?? false,
  } as WorkoutState;
}
