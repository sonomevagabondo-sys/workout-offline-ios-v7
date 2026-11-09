export type DayType = 'Upper' | 'Lower' | 'Rest';

export type WorkoutSet = {
  id: string;
  weight: string;
  reps: string;
};

export type Exercise = {
  id: string;
  name: string;
  group: string;
  custom?: boolean;
  targetSets: number;
  targetReps: number;
  sets: WorkoutSet[];
};

export type WorkoutDay = {
  id: string;
  order: number;
  name: string;
  type: DayType;
  exercises: Exercise[];
  completed: boolean;
  skipped: boolean;
  completedOn?: string;
};

export type Program = {
  id: string;
  name: string;
  cycleStart: string;
  cycleNumber: number;
  days: WorkoutDay[];
  nextCycleDays?: WorkoutDay[];
};

export type WorkoutLog = {
  id: string;
  dayId: string;
  programId: string;
  completedOn: string;
  streakAfter: number;
  volume: number;
  workoutName?: string;
  unit?: 'kg' | 'lb';
  xpEarned?: number;
  sets?: WorkoutLogSet[];
};

export type WorkoutLogSet = {
  exerciseName: string;
  group: string;
  setIndex: number;
  weight: number;
  reps: number;
};

export type CustomExercise = {
  id: string;
  name: string;
  group: string;
};

export type HistorySet = {
  dayOrder: number;
  dayName: string;
  dayType: DayType;
  exerciseName: string;
  group: string;
  setIndex: number;
  weight: number;
  reps: number;
  completedOn: string;
};

export type CycleHistory = {
  programId?: string;
  cycleNumber: number;
  volume: number;
  completedDays: number;
  totalTrainingDays: number;
  completedOn: string;
  sets: HistorySet[];
};

export type WorkoutState = {
  program: Program;
  programs: Program[];
  activeProgramId: string;
  scheduledProgramId?: string;
  totalXp: number;
  streak: number;
  record: number;
  logs: WorkoutLog[];
  history: CycleHistory[];
  customExercises: CustomExercise[];
  profileName: string;
  unit: 'kg' | 'lb';
  theme: 'dark' | 'light' | 'system';
  streakLostNotice: boolean;
};

const catalog: Array<[string, string, number, number]> = [
  ['Panca piana', 'Petto', 3, 8],
  ['Distensioni inclinate', 'Petto', 3, 10],
  ['Croci ai cavi', 'Petto', 3, 12],
  ['Push-up', 'Petto', 3, 12],
  ['Lat machine', 'Schiena', 3, 10],
  ['Rematore', 'Schiena', 3, 8],
  ['Pulley basso', 'Schiena', 3, 10],
  ['Face pull', 'Spalle', 3, 12],
  ['Military press', 'Spalle', 3, 8],
  ['Alzate laterali', 'Spalle', 3, 12],
  ['Curl con bilanciere', 'Bicipiti', 3, 10],
  ['Curl a martello', 'Bicipiti', 3, 10],
  ['Pushdown cavo', 'Tricipiti', 3, 12],
  ['French press', 'Tricipiti', 3, 10],
  ['Squat', 'Gambe', 4, 8],
  ['Stacco rumeno', 'Gambe', 3, 10],
  ['Leg press', 'Gambe', 3, 12],
  ['Calf raise', 'Gambe', 4, 12],
  ['Plank', 'Addome', 3, 30],
];

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const todayIso = () => toIsoDate(new Date());

export const fromIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (value: string, amount: number) => {
  const date = fromIsoDate(value);
  date.setDate(date.getDate() + amount);
  return toIsoDate(date);
};

export const daysBetween = (from: string, to: string) =>
  Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86400000);

export const formatItalianDate = (value: string) =>
  fromIsoDate(value).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

export const formatItalianDateLong = (value: string) =>
  fromIsoDate(value).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

const makeExercise = (name: string, group: string, sets: number, reps: number): Exercise => ({
  id: uid('exercise'),
  name,
  group,
  targetSets: sets,
  targetReps: reps,
  sets: Array.from({ length: sets }, () => ({ id: uid('set'), weight: '', reps: '' })),
});

const dayExercises = (groups: string[]): Exercise[] =>
  catalog
    .filter((item) => groups.includes(item[1]))
    .slice(0, 4)
    .map(([name, group, sets, reps]) => makeExercise(name, group, sets, reps));

export const createDefaultProgram = (startDate = todayIso()): Program => ({
  id: uid('program'),
  name: 'Upper & Lower',
  cycleStart: startDate,
  cycleNumber: 1,
  days: ['Upper', 'Lower', 'Rest', 'Upper', 'Lower', 'Rest', 'Rest'].map((type, index) => ({
    id: uid('day'),
    order: index + 1,
        name: type === 'Rest' ? 'Riposo' : type,
    type: type as DayType,
    exercises:
      type === 'Upper'
        ? dayExercises(index === 0 ? ['Petto', 'Spalle', 'Tricipiti'] : ['Schiena', 'Spalle', 'Bicipiti'])
        : type === 'Lower'
          ? dayExercises(['Gambe', 'Addome'])
          : [],
    completed: false,
    skipped: false,
  })),
});

export const getCycleDayIndex = (program: Program, date: string) =>
  daysBetween(program.cycleStart, date);

export const getTodayDay = (program: Program, date: string): WorkoutDay | undefined => {
  const dayIndex = getCycleDayIndex(program, date);
  if (dayIndex < 0) return undefined;
  return program.days[Math.min(dayIndex, 6)];
};

export const isSetComplete = (set: WorkoutSet) =>
  Number(set.weight) > 0 && Number(set.reps) > 0;

export const isDayReadyToFinish = (day: WorkoutDay) =>
  day.type !== 'Rest' &&
  !day.skipped &&
  day.exercises.length > 0 &&
  day.exercises.every((exercise) => exercise.sets.every(isSetComplete));

export const dayVolume = (day: WorkoutDay) =>
  day.exercises.reduce(
    (total, exercise) =>
      total +
      exercise.sets.reduce((exerciseTotal, set) => exerciseTotal + Number(set.weight || 0) * Number(set.reps || 0), 0),
    0,
  );

export const archiveCycleSets = (program: Program): HistorySet[] =>
  program.days.flatMap((day) =>
    day.exercises.flatMap((exercise) =>
      exercise.sets.map((set, setIndex) => ({
        dayOrder: day.order,
        dayName: day.name,
        dayType: day.type,
        exerciseName: exercise.name,
        group: exercise.group,
        setIndex,
        weight: Number(set.weight || 0),
        reps: Number(set.reps || 0),
        completedOn: addDays(program.cycleStart, day.order - 1),
      })),
    ),
  );

export const isMilestone = (streak: number) =>
  [3, 7, 14, 30, 50, 75, 100, 150, 200, 365].includes(streak);

export const estimatedOneRepMax = (weight: number, reps: number) => weight * (1 + reps / 30);

export const exerciseCatalog = catalog.map(([name, group, sets, reps]) => ({
  name,
  group,
  sets,
  reps,
}));

export const createProgram = (name: string, days: Array<{ type: DayType; name?: string; exercises: Exercise[] }>, startDate: string): Program => ({
  id: uid('program'),
  name,
  cycleStart: startDate,
  cycleNumber: 1,
  days: days.map((day, index) => ({
    id: uid('day'),
    order: index + 1,
    name: day.type === 'Rest' ? 'Riposo' : day.name?.trim() || 'Allenamento',
    type: day.type,
    exercises: day.exercises,
    completed: false,
    skipped: false,
  })),
});