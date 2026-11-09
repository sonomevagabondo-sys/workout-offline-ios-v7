import {
  addDays,
  CycleHistory,
  estimatedOneRepMax,
  Program,
  WorkoutLog,
  WorkoutLogSet,
} from '@/domain/workout';

export type PersonalRecordStatus = 'above' | 'balanced' | 'below' | 'insufficient';
export type ProgramBalanceStatus = 'below' | 'balanced' | 'above' | 'unavailable';

export type PersonalRecordPoint = {
  completedOn: string;
  volume: number;
  maxWeight: number;
  estimatedOneRepMax: number | null;
};

export type PersonalRecord = {
  exerciseName: string;
  group: string;
  bestWeight: number;
  bestReps: number;
  bestDate: string;
  bestSessionVolume: number;
  estimatedOneRepMax: number | null;
  sessionCount: number;
  latestDate: string;
  latestVolume: number;
  averagePreviousVolume: number | null;
  performanceChangePercent: number | null;
  performanceStatus: PersonalRecordStatus;
  plannedWeeklySets: number;
  averageGroupWeeklySets: number | null;
  balanceRatio: number | null;
  balanceStatus: ProgramBalanceStatus;
  progression: PersonalRecordPoint[];
};

type SessionExercise = {
  sessionKey: string;
  programId: string;
  dayId: string;
  completedOn: string;
  exerciseName: string;
  group: string;
  sets: Map<number, { weight: number; reps: number }>;
};

export type ExerciseHistorySet = {
  setIndex: number;
  weight: number;
  reps: number;
};

export type ExerciseHistorySession = {
  id: string;
  completedOn: string;
  volume: number;
  maxWeight: number;
  estimatedOneRepMax: number | null;
  sets: ExerciseHistorySet[];
};

export type ExerciseHistory = {
  exerciseName: string;
  group: string;
  sessions: ExerciseHistorySession[];
};

function convertWeight(weight: number, source: 'kg' | 'lb' | undefined, target: 'kg' | 'lb') {
  const from = source ?? target;
  if (from === target) return weight;
  return from === 'kg' ? weight * 2.2046226218 : weight / 2.2046226218;
}

function sessionKey(programId: string, date: string, dayId: string) {
  return `${programId}|${date}|${dayId}`;
}

function addSessionSets(
  sessions: Map<string, SessionExercise>,
  programId: string,
  dayId: string,
  completedOn: string,
  sets: WorkoutLogSet[],
  sourceUnit: 'kg' | 'lb' | undefined,
  targetUnit: 'kg' | 'lb',
) {
  const key = sessionKey(programId, completedOn, dayId);
  sets.forEach((set) => {
    const exerciseName = set.exerciseName.trim();
    if (!exerciseName || set.weight <= 0 || set.reps <= 0) return;
    const exerciseKey = `${key}|${exerciseName.toLocaleLowerCase()}`;
    const entry = sessions.get(exerciseKey) ?? {
      sessionKey: key,
      programId,
      dayId,
      completedOn,
      exerciseName,
      group: set.group,
      sets: new Map<number, { weight: number; reps: number }>(),
    };
    entry.sets.set(set.setIndex, {
      weight: convertWeight(set.weight, sourceUnit, targetUnit),
      reps: set.reps,
    });
    sessions.set(exerciseKey, entry);
  });
}

function setsFromDay(program: Program, dayIndex: number) {
  const day = program.days[dayIndex];
  return day.exercises.flatMap((exercise) =>
    exercise.sets.map((set, setIndex) => ({
      exerciseName: exercise.name,
      group: exercise.group,
      setIndex,
      weight: Number(set.weight || 0),
      reps: Number(set.reps || 0),
    })),
  );
}

function buildCompletedSessions(
  logs: WorkoutLog[],
  cycles: CycleHistory[],
  programs: Program[],
  unit: 'kg' | 'lb',
) {
  const sessions = new Map<string, SessionExercise>();
  const programsById = new Map(programs.map((program) => [program.id, program]));

  logs.forEach((log) => {
    if (!log.sets?.length) return;
    addSessionSets(
      sessions,
      log.programId,
      log.dayId,
      log.completedOn,
      log.sets,
      log.unit,
      unit,
    );
  });

  cycles.forEach((cycle) => {
    const programId = cycle.programId;
    const program = programId ? programsById.get(programId) : undefined;
    if (!programId || !program) return;
    (cycle.sets ?? []).forEach((set) => {
      const day = program.days.find((item) => item.order === set.dayOrder);
      if (!day) return;
      const completionLog = logs.find(
        (log) =>
          log.programId === programId &&
          log.dayId === day.id &&
          log.completedOn === set.completedOn,
      );
      if (!completionLog || completionLog.sets?.length) return;
      addSessionSets(
        sessions,
        programId,
        day.id,
        completionLog.completedOn,
        [{
          exerciseName: set.exerciseName,
          group: set.group,
          setIndex: set.setIndex,
          weight: set.weight,
          reps: set.reps,
        }],
        completionLog.unit,
        unit,
      );
    });
  });

  programs.forEach((program) => {
    program.days.forEach((day, index) => {
      if (!day.completed || day.type === 'Rest') return;
      const completedOn = day.completedOn ?? addDays(program.cycleStart, day.order - 1);
      const completionLog = logs.find(
        (log) =>
          log.programId === program.id &&
          log.dayId === day.id &&
          log.completedOn === completedOn,
      );
      if (completionLog?.sets?.length) return;
      addSessionSets(
        sessions,
        program.id,
        day.id,
        completedOn,
        setsFromDay(program, index),
        completionLog?.unit,
        unit,
      );
    });
  });

  return [...sessions.values()];
}

export function buildExerciseHistory({
  logs,
  cycles,
  programs,
  unit,
}: {
  logs: WorkoutLog[];
  cycles: CycleHistory[];
  programs: Program[];
  unit: 'kg' | 'lb';
}): ExerciseHistory[] {
  const byExercise = new Map<string, { exerciseName: string; group: string; sessions: ExerciseHistorySession[] }>();
  buildCompletedSessions(logs, cycles, programs, unit).forEach((session) => {
    const key = session.exerciseName.trim().toLocaleLowerCase();
    const exercise = byExercise.get(key) ?? {
      exerciseName: session.exerciseName,
      group: session.group,
      sessions: [],
    };
    const sets = [...session.sets.entries()]
      .map(([setIndex, set]) => ({ setIndex, ...set }))
      .sort((a, b) => a.setIndex - b.setIndex);
    const estimatedMax = sets
      .filter((set) => set.reps <= 12)
      .reduce((best, set) => Math.max(best, estimatedOneRepMax(set.weight, set.reps)), 0);
    exercise.sessions.push({
      id: session.sessionKey,
      completedOn: session.completedOn,
      volume: sets.reduce((total, set) => total + set.weight * set.reps, 0),
      maxWeight: Math.max(0, ...sets.map((set) => set.weight)),
      estimatedOneRepMax: estimatedMax > 0 ? estimatedMax : null,
      sets,
    });
    byExercise.set(key, exercise);
  });

  return [...byExercise.values()]
    .map((exercise) => ({
      ...exercise,
      sessions: exercise.sessions.sort(
        (a, b) => a.completedOn.localeCompare(b.completedOn) || a.id.localeCompare(b.id),
      ),
    }))
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName, 'it'));
}

function getProgramSetBalance(program: Program) {
  const groupSets = new Map<string, number>();
  program.days.forEach((day) => {
    if (day.type === 'Rest') return;
    day.exercises.forEach((exercise) => {
      const count = Math.max(0, Number(exercise.targetSets) || exercise.sets.length);
      groupSets.set(exercise.group, (groupSets.get(exercise.group) ?? 0) + count);
    });
  });
  const values = [...groupSets.values()];
  const average = values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
  return { groupSets, average };
}

export function buildPersonalRecords({
  logs,
  cycles,
  programs,
  activeProgram,
  unit,
}: {
  logs: WorkoutLog[];
  cycles: CycleHistory[];
  programs: Program[];
  activeProgram: Program;
  unit: 'kg' | 'lb';
}): PersonalRecord[] {
  const sessions = buildCompletedSessions(logs, cycles, programs, unit);
  const byExercise = new Map<string, SessionExercise[]>();

  sessions.forEach((session) => {
    const exerciseKey = session.exerciseName.trim().toLocaleLowerCase();
    const exerciseSessions = byExercise.get(exerciseKey) ?? [];
    exerciseSessions.push(session);
    byExercise.set(exerciseKey, exerciseSessions);
  });

  const balance = getProgramSetBalance(activeProgram);
  const activeGroupsByExercise = new Map(
    activeProgram.days.flatMap((day) => day.exercises).map((exercise) => [
      exercise.name.trim().toLocaleLowerCase(),
      exercise.group,
    ]),
  );
  return [...byExercise.values()]
    .map((exerciseSessions) => {
      const ordered = exerciseSessions.sort(
        (a, b) =>
          a.completedOn.localeCompare(b.completedOn) ||
          a.programId.localeCompare(b.programId),
      );
      const first = ordered[0];
      const sets = ordered.flatMap((session) =>
        [...session.sets.values()].map((set) => ({
          ...set,
          completedOn: session.completedOn,
          sessionVolume: [...session.sets.values()].reduce(
            (volume, item) => volume + item.weight * item.reps,
            0,
          ),
        })),
      );
      const bestSet = sets.reduce<(typeof sets)[number] | null>((best, current) => {
        if (!best) return current;
        if (current.weight > best.weight) return current;
        if (current.weight === best.weight && current.reps > best.reps) return current;
        if (
          current.weight === best.weight &&
          current.reps === best.reps &&
          current.completedOn > best.completedOn
        ) return current;
        return best;
      }, null);
      if (!bestSet) return null;

      const latest = ordered[ordered.length - 1];
      const group =
        activeGroupsByExercise.get(first.exerciseName.trim().toLocaleLowerCase()) ??
        latest.group;
      const sessionVolume = (session: SessionExercise) =>
        [...session.sets.values()].reduce((total, set) => total + set.weight * set.reps, 0);
      const progression = ordered.map((session) => {
        const sessionSets = [...session.sets.values()];
        const estimatedMax = sessionSets
          .filter((set) => set.reps <= 12)
          .reduce((best, set) => Math.max(best, estimatedOneRepMax(set.weight, set.reps)), 0);
        return {
          completedOn: session.completedOn,
          volume: sessionVolume(session),
          maxWeight: Math.max(0, ...sessionSets.map((set) => set.weight)),
          estimatedOneRepMax: estimatedMax > 0 ? estimatedMax : null,
        };
      });
      const previousSessions = ordered.slice(Math.max(0, ordered.length - 6), -1);
      const averagePreviousVolume = previousSessions.length
        ? previousSessions.reduce((total, session) => total + sessionVolume(session), 0) / previousSessions.length
        : null;
      const latestVolume = sessionVolume(latest);
      const performanceChangePercent =
        averagePreviousVolume && averagePreviousVolume > 0
          ? ((latestVolume - averagePreviousVolume) / averagePreviousVolume) * 100
          : null;
      const performanceStatus: PersonalRecordStatus =
        performanceChangePercent === null
          ? 'insufficient'
          : performanceChangePercent > 5
            ? 'above'
            : performanceChangePercent < -5
              ? 'below'
              : 'balanced';
      const plannedWeeklySets = balance.groupSets.get(group) ?? 0;
      const hasPlannedGroup = balance.groupSets.has(group);
      const balanceRatio =
        hasPlannedGroup && balance.average && balance.average > 0
          ? plannedWeeklySets / balance.average
          : null;
      const balanceStatus: ProgramBalanceStatus =
        balanceRatio === null
          ? 'unavailable'
          : balanceRatio < 0.75
            ? 'below'
            : balanceRatio > 1.25
              ? 'above'
              : 'balanced';
      const estimatedMax = sets
        .filter((set) => set.reps <= 12)
        .reduce((best, set) => Math.max(best, estimatedOneRepMax(set.weight, set.reps)), 0);

      return {
        exerciseName: first.exerciseName,
        group,
        bestWeight: bestSet.weight,
        bestReps: bestSet.reps,
        bestDate: bestSet.completedOn,
        bestSessionVolume: bestSet.sessionVolume,
        estimatedOneRepMax: estimatedMax > 0 ? estimatedMax : null,
        sessionCount: ordered.length,
        latestDate: latest.completedOn,
        latestVolume,
        averagePreviousVolume,
        performanceChangePercent,
        performanceStatus,
        plannedWeeklySets,
        averageGroupWeeklySets: balance.average,
        balanceRatio,
        balanceStatus,
        progression,
      };
    })
    .filter((record): record is PersonalRecord => record !== null)
    .sort(
      (a, b) =>
        b.bestDate.localeCompare(a.bestDate) ||
        a.group.localeCompare(b.group) ||
        a.exerciseName.localeCompare(b.exerciseName),
    );
}
