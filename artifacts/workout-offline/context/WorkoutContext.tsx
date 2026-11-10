import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  createDefaultProgram,
  CustomExercise,
  CycleHistory,
  dayVolume,
  daysBetween,
  getCycleDayIndex,
  getTodayDay,
  isDayReadyToFinish,
  Program,
  archiveCycleSets,
  todayIso,
  WorkoutDay,
  WorkoutLog,
  WorkoutLogSet,
  WorkoutState,
  WorkoutSet,
} from '@/domain/workout';
import {
  getRankProgress,
  getWorkoutComparisons,
  WorkoutCompletionSummary,
  XP_PER_WORKOUT,
} from '@/domain/progression';

type WorkoutContextValue = WorkoutState & {
  allHistory: CycleHistory[];
  hydrated: boolean;
  today: string;
  todayDay: WorkoutDay | undefined;
  cycleDay: number;
  updateSet: (dayId: string, exerciseId: string, setId: string, field: keyof Pick<WorkoutSet, 'weight' | 'reps'>, value: string) => void;
  finishToday: () => WorkoutCompletionSummary | null;
  createNewProgram: (program: Program) => void;
  updateProgram: (programId: string, name: string, days: WorkoutDay[], changedDayIndices: number[]) => void;
  clearProfile: () => void;
  setProfileName: (name: string) => void;
  setUnit: (unit: 'kg' | 'lb') => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  dismissStreakLost: () => void;
  switchProgram: (programId: string) => void;
  deleteProgram: (programId: string) => void;
  addCustomExercise: (name: string, group: string) => boolean;
  removeCustomExercise: (exerciseId: string) => void;
  getBackupState: () => WorkoutState;
  restoreBackup: (backupState: WorkoutState) => Promise<void>;
};

const STORAGE_KEY = 'workout-offline-state-v1';
const WorkoutContext = createContext<WorkoutContextValue | null>(null);

const initialState = (): WorkoutState => {
  const program = createDefaultProgram();
  return {
    program,
    programs: [program],
    activeProgramId: program.id,
    scheduledProgramId: undefined,
    totalXp: 0,
    streak: 0,
    record: 0,
    logs: [],
    history: [],
    customExercises: [],
    profileName: '',
    unit: 'kg',
    theme: 'dark',
    streakLostNotice: false,
  };
};

type StoredWorkoutState = Omit<WorkoutState, 'programs' | 'activeProgramId' | 'totalXp' | 'customExercises'> & {
  programs?: Program[];
  activeProgramId?: string;
  totalXp?: number;
  customExercises?: CustomExercise[];
};

const replaceProgram = (programs: Program[], program: Program) => {
  const exists = programs.some((item) => item.id === program.id);
  return exists ? programs.map((item) => (item.id === program.id ? program : item)) : [...programs, program];
};

const withActiveProgram = (state: WorkoutState, program: Program): WorkoutState => ({
  ...state,
  program,
  programs: replaceProgram(state.programs, program),
  activeProgramId: program.id,
});

const normalizeState = (storedState: StoredWorkoutState, date: string): WorkoutState => {
  const savedPrograms = storedState.programs?.length ? storedState.programs : [storedState.program];
  const savedLogs = Array.isArray(storedState.logs) ? storedState.logs : [];
  const migratedXp = savedLogs.reduce(
    (total, log) => total + (typeof log.xpEarned === 'number' ? log.xpEarned : XP_PER_WORKOUT),
    0,
  );
  const scheduledProgram = savedPrograms.find((program) => program.id === storedState.scheduledProgramId);
  const startScheduledProgram = Boolean(
    scheduledProgram && daysBetween(scheduledProgram.cycleStart, date) >= 0,
  );
  const nextActiveProgramId = startScheduledProgram ? scheduledProgram?.id : storedState.activeProgramId;
  const activeProgram =
    savedPrograms.find((program) => program.id === nextActiveProgramId) ??
    savedPrograms.find((program) => program.id === storedState.program.id) ??
    storedState.program;
  let next: WorkoutState = {
    ...storedState,
    program: activeProgram,
    programs: replaceProgram(savedPrograms, activeProgram),
    activeProgramId: activeProgram.id,
    scheduledProgramId: startScheduledProgram ? undefined : scheduledProgram?.id,
    logs: savedLogs,
    customExercises: Array.isArray(storedState.customExercises) ? storedState.customExercises : [],
    totalXp:
      typeof storedState.totalXp === 'number' && Number.isFinite(storedState.totalXp)
        ? Math.max(0, storedState.totalXp)
        : migratedXp,
  };
  let elapsed = daysBetween(next.program.cycleStart, date);
  let resetCount = 0;
  let history = [...next.history];

  while (elapsed >= 7) {
    const completedDays = next.program.days.filter((day) => day.completed).length;
    history = [
      ...history,
      {
        programId: next.program.id,
        cycleNumber: next.program.cycleNumber,
        volume: next.program.days.reduce((total, day) => total + dayVolume(day), 0),
        completedDays,
        totalTrainingDays: next.program.days.filter((day) => day.type !== 'Rest').length,
        completedOn: addDays(next.program.cycleStart, 6),
        sets: archiveCycleSets(next.program),
      },
    ];
    next = withActiveProgram(next, {
      ...next.program,
      cycleStart: addDays(next.program.cycleStart, 7),
      cycleNumber: next.program.cycleNumber + 1,
      days: (next.program.nextCycleDays ?? next.program.days).map((day) => ({
        ...day,
        completed: false,
        skipped: false,
        completedOn: undefined,
        exercises: day.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({ ...set, weight: '', reps: '' })),
        })),
      })),
      nextCycleDays: undefined,
    });
    elapsed = daysBetween(next.program.cycleStart, date);
    resetCount += 1;
  }

  const dayIndex = Math.min(Math.max(elapsed, 0), 6);
  const days = next.program.days.map((day, index) => {
    const past = index < dayIndex;
    if (past && day.type !== 'Rest' && !day.completed) {
      return { ...day, skipped: true };
    }
    return day;
  });
  const hasNewSkip = days.some((day) => day.skipped && !next.program.days.find((old) => old.id === day.id)?.skipped);
  return {
    ...withActiveProgram(next, { ...next.program, days }),
    history: history.map((cycle) => ({ ...cycle, programId: cycle.programId ?? next.program.id })),
    streakLostNotice: next.streakLostNotice || hasNewSkip,
  };
};

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkoutState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [today, setToday] = useState(todayIso());

  useEffect(() => {
    const load = async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = saved ? (JSON.parse(saved) as StoredWorkoutState) : initialState();
      setState(normalizeState(parsed, todayIso()));
      setToday(todayIso());
      setHydrated(true);
    };
    void load();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextToday = todayIso();
      if (nextToday !== today) {
        setToday(nextToday);
        setState((current) => normalizeState(current, nextToday));
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [today]);

  const updateSet = (
    dayId: string,
    exerciseId: string,
    setId: string,
    field: keyof Pick<WorkoutSet, 'weight' | 'reps'>,
    value: string,
  ) => {
    setState((current) => withActiveProgram(current, {
        ...current.program,
        days: current.program.days.map((day) =>
          day.id !== dayId
            ? day
            : {
                ...day,
                exercises: day.exercises.map((exercise) =>
                  exercise.id !== exerciseId
                    ? exercise
                    : {
                        ...exercise,
                        sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: value.replace(',', '.') } : set)),
                      },
                ),
              },
        ),
      }));
  };

  const finishToday = () => {
    const day = getTodayDay(state.program, today);
    if (!day || !isDayReadyToFinish(day)) return null;
    const previousLog = state.logs.find((log) => log.dayId === day.id && log.completedOn === today);
    const alreadyLogged = Boolean(previousLog);
    const newStreak = alreadyLogged ? state.streak : state.streak + 1;
    const newRecord = Math.max(state.record, newStreak);
    const earnedXp = alreadyLogged ? 0 : XP_PER_WORKOUT;
    const totalXp = state.totalXp + earnedXp;
    const loggedSets: WorkoutLogSet[] = day.exercises.flatMap((exercise) =>
      exercise.sets.map((set, setIndex) => ({
        exerciseName: exercise.name,
        group: exercise.group,
        setIndex,
        weight: Number(set.weight),
        reps: Number(set.reps),
      })),
    );
    const log: WorkoutLog = {
      id: `${day.id}-${today}`,
      dayId: day.id,
      programId: state.program.id,
      completedOn: today,
      streakAfter: previousLog?.streakAfter ?? newStreak,
      volume: dayVolume(day),
      workoutName: day.name,
      unit: state.unit,
      sets: loggedSets,
      ...(previousLog?.xpEarned !== undefined
        ? { xpEarned: previousLog.xpEarned }
        : earnedXp > 0
          ? { xpEarned: earnedXp }
          : {}),
    };
    const comparisons = getWorkoutComparisons(
      day,
      state.logs,
      state.program.id,
      today,
      state.unit,
      dayVolume(day),
    );
    setState((current) => withActiveProgram({
      ...current,
      streak: newStreak,
      record: newRecord,
      totalXp: current.totalXp + earnedXp,
      streakLostNotice: false,
      logs: alreadyLogged
        ? current.logs.map((item) =>
            item.dayId === day.id && item.completedOn === today ? { ...item, ...log } : item,
          )
        : [...current.logs, log],
    }, {
        ...current.program,
        days: current.program.days.map((item) => (item.id === day.id ? { ...item, completed: true, completedOn: today } : item)),
      }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return {
      streak: newStreak,
      epic: !alreadyLogged && (newStreak > state.record || [3, 7, 14, 30, 50, 75, 100, 150, 200, 365].includes(newStreak)),
      newRecord: newStreak > state.record && state.record > 0,
      xpEarned: earnedXp,
      totalXp,
      rank: getRankProgress(totalXp),
      workoutName: day.name,
      workoutVolume: dayVolume(day),
      unit: state.unit,
      comparisons,
    };
  };

  const createNewProgram = (program: Program) => {
    setState((current) => {
      const nextProgram = { ...program, cycleNumber: 1 };
      const programs = [...current.programs, nextProgram];
      if (nextProgram.cycleStart > today) {
        return normalizeState({
          ...current,
          programs,
          scheduledProgramId: nextProgram.id,
        }, today);
      }
      return normalizeState({
        ...current,
        program: nextProgram,
        programs,
        activeProgramId: nextProgram.id,
        scheduledProgramId: undefined,
      }, today);
    });
  };

  const updateProgram = (programId: string, name: string, editedDays: WorkoutDay[], changedDayIndices: number[]) => {
    setState((current) => {
      const existingProgram = current.programs.find((program) => program.id === programId);
      if (!existingProgram) return current;

      const elapsedDays = daysBetween(existingProgram.cycleStart, today);
      const isActiveProgram = current.activeProgramId === programId;
      const latestPlan = existingProgram.nextCycleDays ?? existingProgram.days;
      const changed = [...new Set(changedDayIndices)].filter((index) => index >= 0 && index < 7).sort((a, b) => a - b);
      const applyPlan = (previous: WorkoutDay, edited: WorkoutDay, clearSetValues: boolean): WorkoutDay => {
        const exercises = edited.exercises.map((exercise) => {
          const previousExercise = previous.exercises.find(
            (item) => item.id === exercise.id || item.name === exercise.name,
          );
          const exerciseId = previousExercise?.id ?? `${previous.id}-exercise-${exercise.id}`;
          return {
            ...exercise,
            id: exerciseId,
            sets: exercise.sets.map((set, index) => {
              const previousSet = previousExercise?.sets[index];
              return {
                ...set,
                id: previousSet?.id ?? `${exerciseId}-set-${index + 1}`,
                weight: clearSetValues ? '' : previousSet?.weight ?? '',
                reps: clearSetValues ? '' : previousSet?.reps ?? '',
              };
            }),
          };
        });
        return {
          ...previous,
          name: edited.name,
          type: edited.type,
          exercises,
        };
      };

      const prepareNextCycleDay = (previous: WorkoutDay, edited: WorkoutDay, index: number): WorkoutDay => ({
        ...applyPlan(previous, edited, true),
        order: index + 1,
        completed: false,
        skipped: false,
        completedOn: undefined,
      });

      let nextCycleDays = editedDays.map((edited, index) => {
        const previous = latestPlan[index] ?? existingProgram.days[index];
        return prepareNextCycleDay(previous, edited, index);
      });
      for (const sourceIndex of changed) {
        const source = prepareNextCycleDay(
          nextCycleDays[sourceIndex],
          editedDays[sourceIndex],
          sourceIndex,
        );
        nextCycleDays[sourceIndex] = source;
        const targets = sourceIndex === 6
          ? [0, 1, 2, 3, 4, 5]
          : Array.from({ length: 6 - sourceIndex }, (_, offset) => sourceIndex + offset + 1);
        targets.forEach((targetIndex) => {
          nextCycleDays[targetIndex] = prepareNextCycleDay(
            nextCycleDays[targetIndex],
            source,
            targetIndex,
          );
        });
      }

      let days =
        elapsedDays < 0
          ? changed.length ? nextCycleDays : existingProgram.days
          : elapsedDays < 7
          ? existingProgram.days.map((day, index) => {
              if (
                index < elapsedDays ||
                day.completed ||
                !changed.includes(index)
              ) return day;
              const edited = editedDays[index];
              return edited ? applyPlan(day, edited, false) : day;
            })
          : existingProgram.days;

      if (elapsedDays >= 0 && elapsedDays < 7) {
        for (const sourceIndex of changed) {
          const savedCurrentDay = sourceIndex === elapsedDays && existingProgram.days[sourceIndex]?.completed;
          if (savedCurrentDay) continue;
          const startIndex = Math.max(elapsedDays + (isActiveProgram ? 1 : 0), sourceIndex + 1);
          const source = sourceIndex < elapsedDays || (isActiveProgram && sourceIndex === elapsedDays)
            ? editedDays[sourceIndex]
            : applyPlan(existingProgram.days[sourceIndex], editedDays[sourceIndex], false);
          for (let targetIndex = startIndex; targetIndex < 7; targetIndex += 1) {
            if (!days[targetIndex].completed) {
              days[targetIndex] = applyPlan(days[targetIndex], source, false);
            }
          }
        }
      }

      const updatedProgram: Program = {
        ...existingProgram,
        name: name.trim() || existingProgram.name,
        days,
        nextCycleDays: changed.length ? nextCycleDays : existingProgram.nextCycleDays,
      };
      const programs = current.programs.map((program) =>
        program.id === programId ? updatedProgram : program,
      );
      return isActiveProgram
        ? { ...current, program: updatedProgram, programs }
        : { ...current, programs };
    });
  };

  const switchProgram = (programId: string) => {
    setState((current) => {
      const nextProgram = current.programs.find((program) => program.id === programId);
      if (!nextProgram || (current.scheduledProgramId === programId && nextProgram.cycleStart > today)) {
        return current;
      }
      return normalizeState({
        ...withActiveProgram(current, nextProgram),
        scheduledProgramId: undefined,
      }, today);
    });
  };

  const deleteProgram = (programId: string) => {
    setState((current) => {
      if (current.programs.length <= 1) return current;
      const remaining = current.programs.filter((program) => program.id !== programId);
      const deletedActive = current.activeProgramId === programId;
      const scheduledProgramId = current.scheduledProgramId === programId
        ? undefined
        : current.scheduledProgramId;
      if (!deletedActive) {
        return {
          ...current,
          programs: remaining,
          scheduledProgramId,
          logs: current.logs.filter((log) => log.programId !== programId),
          history: current.history.filter((cycle) => cycle.programId !== programId),
        };
      }
      const nextProgram = remaining.find((program) => program.id !== scheduledProgramId) ?? remaining[0];
      return normalizeState({
        ...current,
        program: nextProgram,
        programs: remaining,
        activeProgramId: nextProgram.id,
        scheduledProgramId,
        logs: current.logs.filter((log) => log.programId !== programId),
        history: current.history.filter((cycle) => cycle.programId !== programId),
      }, today);
    });
  };

  const clearProfile = () => setState((current) => ({ ...current, profileName: '' }));
  const setProfileName = (profileName: string) => setState((current) => ({ ...current, profileName }));
  const setUnit = (unit: 'kg' | 'lb') => setState((current) => ({ ...current, unit }));
  const setTheme = (theme: 'dark' | 'light' | 'system') => setState((current) => ({ ...current, theme }));
  const dismissStreakLost = () => setState((current) => ({ ...current, streakLostNotice: false }));
  const addCustomExercise = (name: string, group: string) => {
    const cleanName = name.trim();
    if (!cleanName || state.customExercises.some((exercise) => exercise.name.trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      return false;
    }
    setState((current) => {
      if (current.customExercises.some((exercise) => exercise.name.trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
        return current;
      }
      return {
        ...current,
        customExercises: [
          ...current.customExercises,
          {
            id: `custom-exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: cleanName,
            group,
          },
        ],
      };
    });
    return true;
  };
  const removeCustomExercise = (exerciseId: string) => setState((current) => ({
    ...current,
    customExercises: current.customExercises.filter((exercise) => exercise.id !== exerciseId),
  }));
  const getBackupState = () => state;
  const restoreBackup = async (backupState: WorkoutState) => {
    const restoreDate = todayIso();
    const restoredState = normalizeState(backupState, restoreDate);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(restoredState));
    setState(restoredState);
    setToday(restoreDate);
    setHydrated(true);
  };

  const value = useMemo(
    () => ({
      ...state,
      allHistory: state.history,
      history: state.history.filter((cycle) => cycle.programId === state.program.id),
      hydrated,
      today,
      todayDay: getTodayDay(state.program, today),
      cycleDay: getCycleDayIndex(state.program, today),
      updateSet,
      finishToday,
      createNewProgram,
      updateProgram,
      clearProfile,
      setProfileName,
      setUnit,
      setTheme,
      dismissStreakLost,
      switchProgram,
      deleteProgram,
      addCustomExercise,
      removeCustomExercise,
      getBackupState,
      restoreBackup,
    }),
    [hydrated, state, today],
  );

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export const useWorkout = () => {
  const context = useContext(WorkoutContext);
  if (!context) throw new Error('useWorkout must be used within WorkoutProvider');
  return context;
};