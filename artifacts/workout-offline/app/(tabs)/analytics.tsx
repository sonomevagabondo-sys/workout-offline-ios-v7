import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useWorkout } from '@/context/WorkoutContext';
import {
  dayVolume,
  daysBetween,
  formatItalianDate,
  formatItalianDateLong,
  HistorySet,
} from '@/domain/workout';
import { EmptyState, Pill, ScreenHeader, SectionTitle } from '@/components/WorkoutUI';
import {
  buildExerciseHistory,
  buildPersonalRecords,
  ExerciseHistory,
  PersonalRecord,
} from '@/domain/personal-records';

type Metric = 'Volume' | 'Peso massimo' | '1RM stimato';

type CurrentCycle = {
  cycleNumber: number;
  volume: number;
  completedDays: number;
  totalTrainingDays: number;
  completedOn: string;
  sets: HistorySet[];
};

export default function AnalyticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const workout = useWorkout();
  const [metric, setMetric] = useState<Metric>('Volume');
  const [expandedCycle, setExpandedCycle] = useState<number | null>(workout.program.cycleNumber);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const currentVolume = workout.program.days.reduce((total, day) => total + dayVolume(day), 0);
  const currentCycle: CurrentCycle = {
    cycleNumber: workout.program.cycleNumber,
    volume: currentVolume,
    completedDays: workout.program.days.filter((day) => day.completed).length,
    totalTrainingDays: workout.program.days.filter((day) => day.type !== 'Rest').length,
    completedOn: workout.today,
    sets: [],
  };
  const cycles = [
    ...workout.history.map((cycle) => ({ ...cycle, sets: cycle.sets ?? [] })),
    currentCycle,
  ];
  const personalRecords = useMemo(
    () =>
      buildPersonalRecords({
        logs: workout.logs,
        cycles: workout.allHistory,
        programs: workout.programs,
        activeProgram: workout.program,
        unit: workout.unit,
      }),
    [workout.logs, workout.allHistory, workout.programs, workout.program, workout.unit],
  );
  const exerciseHistory = useMemo(
    () =>
      buildExerciseHistory({
        logs: workout.logs,
        cycles: workout.allHistory,
        programs: workout.programs,
        unit: workout.unit,
      }),
    [workout.logs, workout.allHistory, workout.programs, workout.unit],
  );
  const availableExercises = useMemo(() => {
    const names = new Map<string, { name: string; group: string }>();
    exerciseHistory.forEach((exercise) => {
      names.set(exercise.exerciseName.trim().toLocaleLowerCase(), {
        name: exercise.exerciseName,
        group: exercise.group,
      });
    });
    workout.programs.forEach((program) => program.days.forEach((day) => day.exercises.forEach((exercise) => {
      const key = exercise.name.trim().toLocaleLowerCase();
      if (!names.has(key)) names.set(key, { name: exercise.name, group: exercise.group });
    })));
    workout.customExercises.forEach((exercise) => {
      const key = exercise.name.trim().toLocaleLowerCase();
      if (!names.has(key)) names.set(key, { name: exercise.name, group: exercise.group });
    });
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [exerciseHistory, workout.programs, workout.customExercises]);
  const prSummary = useMemo(() => {
    const groups = new Map<string, PersonalRecord['balanceStatus']>();
    personalRecords.forEach((record) => groups.set(record.group, record.balanceStatus));
    return {
      aboveAverage: personalRecords.filter((record) => record.performanceStatus === 'above').length,
      balancedGroups: [...groups.values()].filter((status) => status === 'balanced').length,
      totalGroups: groups.size,
    };
  }, [personalRecords]);
  const trendRecord = personalRecords[0] ?? null;
  const trendPoints = trendRecord?.progression.slice(-6) ?? [];
  const trendValues = trendPoints.map((point) =>
    metric === 'Volume'
      ? point.volume
      : metric === 'Peso massimo'
        ? point.maxWeight
        : point.estimatedOneRepMax ?? 0,
  );
  const trendMaxValue = Math.max(...trendValues, 1);
  const currentTrendValue = trendValues[trendValues.length - 1] ?? 0;
  const previousTrendValue = trendValues[trendValues.length - 2] ?? 0;
  const trendChangePercent =
    previousTrendValue > 0
      ? ((currentTrendValue - previousTrendValue) / previousTrendValue) * 100
      : null;
  const trendHasValues = trendValues.some((value) => value > 0);
  const muscleStats = useMemo(() => {
    const stats = new Map<string, { volume: number; exercises: number }>();
    workout.program.days.forEach((day) => {
      day.exercises.forEach((exercise) => {
        const current = stats.get(exercise.group) ?? { volume: 0, exercises: 0 };
        current.exercises += 1;
        current.volume += exercise.sets.reduce((total, set) => total + Number(set.weight || 0) * Number(set.reps || 0), 0);
        stats.set(exercise.group, current);
      });
    });
    return Array.from(stats.entries())
      .map(([group, values]) => ({ group, ...values }))
      .sort((a, b) => b.volume - a.volume || b.exercises - a.exercises);
  }, [workout.program.days]);

  return (
    <View style={[page.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          page.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader eyebrow="Il tuo percorso" title="Statistiche" />
        <View style={page.summaryGrid}>
          <SummaryCard icon="activity" label="Streak" value={`${workout.streak}`} suffix="giorni" color={colors.orange} />
          <SummaryCard icon="award" label="Streak record" value={`${workout.record}`} suffix="giorni" color={colors.primary} />
          <SummaryCard icon="bar-chart-2" label="Volume ciclo" value={`${Math.round(currentVolume)}`} suffix="kg" color={colors.success} />
        </View>

        <SectionTitle title="Volume per ciclo" action={<Pill tone="purple">IN CORSO</Pill>} />
        <View style={[page.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={page.barChart}>
            {cycles.slice(-6).map((cycle) => {
              const max = Math.max(...cycles.map((item) => item.volume), 1);
              const height = Math.max(8, (cycle.volume / max) * 132);
              return (
                <View key={cycle.cycleNumber} style={page.barItem}>
                  <View style={page.barValueWrap}>
                    <Text style={[page.barValue, { color: colors.mutedForeground }]}>
                      {cycle.volume > 999 ? `${(cycle.volume / 1000).toFixed(1)}k` : Math.round(cycle.volume)}
                    </Text>
                    <View style={[page.bar, { height, backgroundColor: cycle.cycleNumber === workout.program.cycleNumber ? colors.primary : colors.muted }]} />
                  </View>
                  <Text style={[page.barLabel, { color: colors.mutedForeground }]}>
                    {cycle.cycleNumber === workout.program.cycleNumber ? 'Ora' : `C${cycle.cycleNumber}`}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <SectionTitle title="Progressione esercizi" action={trendRecord ? <Text style={[page.sectionHint, { color: colors.primary }]}>{trendRecord.exerciseName}</Text> : undefined} />
        {trendRecord ? (
          <>
            <View style={[page.segmented, { backgroundColor: colors.muted }]}>
              {(['Volume', 'Peso massimo', '1RM stimato'] as const).map((item) => (
                <Text
                  key={item}
                  accessibilityRole="button"
                  testID={`analytics-metric-${item}`}
                  onPress={() => setMetric(item)}
                  style={[
                    page.segment,
                    {
                      color: metric === item ? colors.foreground : colors.mutedForeground,
                      backgroundColor: metric === item ? colors.card : 'transparent',
                    },
                  ]}
                >
                  {item}
                </Text>
              ))}
            </View>
            {trendHasValues ? (
              <View style={[page.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={page.progressHeader}>
                  <View style={[page.exerciseDot, { backgroundColor: colors.accent }]}>
                    <Feather name="trending-up" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[page.progressTitle, { color: colors.foreground }]}>{trendRecord.exerciseName}</Text>
                    <Text style={[page.progressSubtitle, { color: colors.mutedForeground }]}>
                      {metric} · ultime {trendPoints.length} sessioni
                    </Text>
                  </View>
                  <Text style={[page.progressMetric, { color: trendChangePercent === null ? colors.mutedForeground : trendChangePercent >= 0 ? colors.success : colors.orange }]}>
                    {trendChangePercent === null
                      ? 'Nuovo'
                      : `${trendChangePercent > 0 ? '+' : ''}${Math.round(trendChangePercent)}%`}
                  </Text>
                </View>
                <View style={page.trendBars}>
                  {trendPoints.map((point, index) => {
                    const value = trendValues[index] ?? 0;
                    const height = value > 0 ? Math.max(8, (value / trendMaxValue) * 100) : 4;
                    return (
                      <View key={`${point.completedOn}-${index}`} style={page.trendColumn}>
                        <Text style={[page.trendValue, { color: colors.mutedForeground }]}>
                          {value > 0 ? Math.round(value).toLocaleString('it-IT') : '—'}
                        </Text>
                        <View style={page.trendBarTrack}>
                          <View
                            style={[
                              page.trendBar,
                              {
                                height,
                                backgroundColor: index === trendPoints.length - 1 ? colors.primary : colors.muted,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[page.trendDate, { color: colors.mutedForeground }]}>
                          {formatItalianDate(point.completedOn)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <EmptyState
                title="Dato non disponibile"
                description="Per stimare l’1RM servono set con 12 ripetizioni o meno. Prova Volume o Peso massimo per questo esercizio."
              />
            )}
          </>
        ) : (
          <EmptyState
            title="La progressione apparirà qui"
            description="Registra almeno un allenamento completato per vedere un andamento reale, senza valori dimostrativi."
          />
        )}

        <SectionTitle title="Dettaglio allenamenti" action={<Text style={[page.sectionHint, { color: colors.mutedForeground }]}>peso · rip.</Text>} />
        <View style={[page.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {cycles.slice().reverse().map((cycle) => {
            const isCurrent = cycle.cycleNumber === workout.program.cycleNumber;
            const cycleOpen = expandedCycle === cycle.cycleNumber;
            const cycleDays = isCurrent
              ? workout.program.days.map((day) => ({
                  order: day.order,
                  name: day.name,
                  type: day.type,
                  sets: day.exercises.flatMap((exercise) =>
                    exercise.sets.map((set, setIndex) => ({
                      dayOrder: day.order,
                      dayName: day.name,
                      dayType: day.type,
                      exerciseName: exercise.name,
                      group: exercise.group,
                      setIndex,
                      weight: Number(set.weight || 0),
                      reps: Number(set.reps || 0),
                      completedOn: day.completedOn ?? workout.today,
                    })),
                  ),
                }))
              : Array.from(new Set(cycle.sets.map((set) => set.dayOrder))).sort((a, b) => a - b).map((order) => ({
                  order,
                  name: cycle.sets.find((set) => set.dayOrder === order)?.dayName ?? `Giorno ${order}`,
                  type: cycle.sets.find((set) => set.dayOrder === order)?.dayType ?? 'Rest',
                  sets: cycle.sets.filter((set) => set.dayOrder === order),
                }));

            return (
              <View key={cycle.cycleNumber} style={[page.cycleBlock, { borderBottomColor: colors.border }]}>
                <Pressable onPress={() => setExpandedCycle(cycleOpen ? null : cycle.cycleNumber)} style={page.cycleHeader}>
                  <View style={[page.cycleDot, { backgroundColor: isCurrent ? colors.primary : colors.muted }]}>
                    <Text style={[page.cycleDotText, { color: isCurrent ? colors.primaryForeground : colors.mutedForeground }]}>{cycle.cycleNumber}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[page.cycleName, { color: colors.foreground }]}>Ciclo {cycle.cycleNumber} {isCurrent ? '· in corso' : ''}</Text>
                    <Text style={[page.cycleMeta, { color: colors.mutedForeground }]}>{Math.round(cycle.volume).toLocaleString('it-IT')} kg · {cycle.completedDays}/{cycle.totalTrainingDays} giorni</Text>
                  </View>
                  <Feather name={cycleOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                </Pressable>
                {cycleOpen ? (
                  <View style={page.cycleContent}>
                    {cycleDays.map((day) => {
                      const dayKey = `${cycle.cycleNumber}-${day.order}`;
                      const dayOpen = expandedDay === dayKey;
                      const exerciseNames = Array.from(new Set(day.sets.map((set) => set.exerciseName)));
                      return (
                        <View key={dayKey} style={[page.detailDay, { borderTopColor: colors.border }]}>
                          <Pressable onPress={() => setExpandedDay(dayOpen ? null : dayKey)} style={page.detailDayHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={[page.detailDayTitle, { color: colors.foreground }]}>Giorno {day.order} · {day.type === 'Rest' ? 'Riposo' : day.name}</Text>
                              <Text style={[page.detailDayMeta, { color: colors.mutedForeground }]}>
                                {day.type === 'Rest' ? 'Nessuna serie' : `${exerciseNames.length} esercizi · ${day.sets.length} serie`}
                              </Text>
                            </View>
                            <Feather name={dayOpen ? 'minus-circle' : 'plus-circle'} size={18} color={colors.primary} />
                          </Pressable>
                          {dayOpen && day.type !== 'Rest' ? (
                            <View style={page.exerciseDetails}>
                              {exerciseNames.map((exerciseName) => {
                                const exerciseSets = day.sets.filter((set) => set.exerciseName === exerciseName);
                                return (
                                  <View key={exerciseName} style={page.exerciseDetail}>
                                    <View style={page.exerciseDetailHeader}>
                                      <Text style={[page.exerciseDetailName, { color: colors.foreground }]}>{exerciseName}</Text>
                                      <Text style={[page.exerciseDetailGroup, { color: colors.mutedForeground }]}>{exerciseSets[0]?.group}</Text>
                                    </View>
                                    {exerciseSets.map((set) => (
                                      <View key={`${exerciseName}-${set.setIndex}`} style={[page.historySetRow, { backgroundColor: colors.surface2 }]}>
                                        <Text style={[page.historySetNumber, { color: colors.mutedForeground }]}>{set.setIndex + 1}</Text>
                                        <Text style={[page.historySetValue, { color: colors.foreground }]}>{set.weight > 0 ? `${set.weight} kg` : '—'}</Text>
                                        <Text style={[page.historySetSeparator, { color: colors.mutedForeground }]}>×</Text>
                                        <Text style={[page.historySetValue, { color: colors.foreground }]}>{set.reps > 0 ? `${set.reps} rip.` : '—'}</Text>
                                      </View>
                                    ))}
                                  </View>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <SectionTitle
          title="PR · Record personali"
          action={<Pill tone="purple">{personalRecords.length} ESERCIZI</Pill>}
        />
        {personalRecords.length ? (
          <>
            <View style={page.prSummaryGrid}>
              <PrSummaryMetric label="PR tracciati" value={`${personalRecords.length}`} color={colors.primary} />
              <PrSummaryMetric label="Sopra media" value={`${prSummary.aboveAverage}`} color={colors.success} />
              <PrSummaryMetric
                label="Gruppi in linea"
                value={prSummary.totalGroups ? `${prSummary.balancedGroups}/${prSummary.totalGroups}` : '—'}
                color={colors.orange}
              />
            </View>
            <Text style={[page.prIntro, { color: colors.mutedForeground }]}>
              Dati ricavati dagli allenamenti completati e dal programma attivo.
            </Text>
            {personalRecords.map((record) => (
              <PersonalRecordCard
                key={`${record.group}-${record.exerciseName}`}
                record={record}
                unit={workout.unit}
                today={workout.today}
                colors={colors}
              />
            ))}
            <View style={[page.prInfo, { backgroundColor: colors.surface2 }]}>
              <Feather name="info" size={15} color={colors.primary} />
              <Text style={[page.prInfoText, { color: colors.mutedForeground }]}>
                “Sopra/sotto media” indica uno scarto di oltre 5% rispetto alle ultime cinque sessioni personali. “In equilibrio” confronta le serie settimanali dei gruppi attivi nel programma, con una tolleranza del 25%; non è uno standard universale.
              </Text>
            </View>
          </>
        ) : (
          <EmptyState
            title="Nessun PR registrato"
            description="Completa un allenamento con i carichi inseriti per vedere record, ripetizioni, date e andamento personale."
          />
        )}

        <SectionTitle
          title="Storico esercizi"
          action={<Pill tone="purple">{availableExercises.length} ESERCIZI</Pill>}
        />
        <Text style={[page.prIntro, { color: colors.mutedForeground }]}>
          Apri un esercizio per vedere i carichi nel tempo e ogni serie registrata nelle sessioni completate.
        </Text>
        {availableExercises.length ? (
          <View style={[page.exerciseHistoryList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {availableExercises.map((exercise, index) => {
              const history = exerciseHistory.find(
                (item) => item.exerciseName.trim().toLocaleLowerCase() === exercise.name.trim().toLocaleLowerCase(),
              );
              const latest = history?.sessions[history.sessions.length - 1];
              return (
                <Pressable
                  key={`${exercise.group}-${exercise.name}`}
                  testID={`exercise-history-${exercise.name}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Apri storico ${exercise.name}`}
                  onPress={() => setSelectedExercise(exercise.name)}
                  style={({ pressed }) => [
                    page.exerciseHistoryRow,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    index === availableExercises.length - 1 && page.exerciseHistoryLastRow,
                  ]}
                >
                  <View style={[page.historyExerciseIcon, { backgroundColor: colors.accent }]}>
                    <Feather name="activity" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[page.historyExerciseName, { color: colors.foreground }]}>{exercise.name}</Text>
                    <Text style={[page.historyExerciseMeta, { color: colors.mutedForeground }]}>
                      {exercise.group} · {history?.sessions.length ?? 0} {(history?.sessions.length ?? 0) === 1 ? 'sessione' : 'sessioni'}
                    </Text>
                  </View>
                  <View style={page.historyExerciseLatest}>
                    <Text style={[page.historyExerciseLoad, { color: latest ? colors.foreground : colors.mutedForeground }]}>
                      {latest ? `${formatMetric(Math.max(...latest.sets.map((set) => set.weight)), workout.unit)}` : '—'}
                    </Text>
                    <Text style={[page.historyExerciseMeta, { color: colors.mutedForeground }]}>
                      {latest ? formatItalianDate(latest.completedOn) : 'Nessuna sessione'}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState
            title="Nessun esercizio da mostrare"
            description="Aggiungi esercizi a un programma o crea un esercizio personalizzato nel Profilo."
          />
        )}

        <SectionTitle title="Gruppi muscolari" />
        <View style={[page.muscleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {muscleStats.length === 0 ? <Text style={[page.muscleEmpty, { color: colors.mutedForeground }]}>Aggiungi esercizi al programma per vedere i gruppi muscolari.</Text> : muscleStats.map((item, index) => {
            const totalVolume = muscleStats.reduce((total, stat) => total + stat.volume, 0);
            const totalExercises = muscleStats.reduce((total, stat) => total + stat.exercises, 0);
            const percentage = totalVolume > 0 ? Math.round((item.volume / totalVolume) * 100) : Math.round((item.exercises / totalExercises) * 100);
            return <View key={item.group} style={page.muscleRow}>
              <View style={{ flex: 1 }}><Text style={[page.muscleName, { color: colors.foreground }]}>{item.group}</Text><View style={[page.muscleTrack, { backgroundColor: colors.muted }]}><View style={[page.muscleFill, { backgroundColor: [colors.primary, colors.orange, colors.success, colors.accentForeground][index % 4], width: `${Math.max(percentage, 4)}%` }]} /></View></View>
              <Text style={[page.muscleValue, { color: colors.mutedForeground }]}>{percentage}%</Text>
            </View>;
          })}
        </View>
      </ScrollView>
      {selectedExercise ? (
        <ExerciseHistoryModal
          name={selectedExercise}
          group={availableExercises.find((exercise) => exercise.name === selectedExercise)?.group ?? ''}
          history={exerciseHistory.find(
            (exercise) => exercise.exerciseName.trim().toLocaleLowerCase() === selectedExercise.trim().toLocaleLowerCase(),
          )}
          unit={workout.unit}
          onClose={() => setSelectedExercise(null)}
        />
      ) : null}
    </View>
  );
}

function formatMetric(value: number, unit: string) {
  return `${Number(value.toFixed(1)).toLocaleString('it-IT')} ${unit}`;
}

function ExerciseHistoryModal({
  name,
  group,
  history,
  unit,
  onClose,
}: {
  name: string;
  group: string;
  history: ExerciseHistory | undefined;
  unit: 'kg' | 'lb';
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sessions = history?.sessions ?? [];
  const chartSessions = sessions.slice(-6);
  const chartMax = Math.max(1, ...chartSessions.map((session) => session.maxWeight));
  const maxWeight = Math.max(0, ...sessions.map((session) => session.maxWeight));
  const totalLifts = sessions.reduce((total, session) => total + session.sets.length, 0);

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[page.historyOverlay, { backgroundColor: `${colors.background}E8` }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi storico esercizio"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            page.historyModal,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingTop: insets.top + 10,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View style={[page.modalHandle, { backgroundColor: colors.border }]} />
          <View style={page.historyModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[page.historyModalEyebrow, { color: colors.primary }]}>{group || 'ESERCIZIO'}</Text>
              <Text style={[page.historyModalTitle, { color: colors.foreground }]} numberOfLines={2}>{name}</Text>
            </View>
            <Pressable
              testID="close-exercise-history"
              accessibilityRole="button"
              accessibilityLabel="Chiudi"
              onPress={onClose}
              hitSlop={10}
              style={[page.historyClose, { backgroundColor: colors.surface2 }]}
            >
              <Feather name="x" size={19} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={page.historyModalContent}
          >
            {sessions.length ? (
              <>
                <View style={page.historyStats}>
                  <HistoryStat label="Sessioni" value={`${sessions.length}`} colors={colors} />
                  <HistoryStat label="Serie registrate" value={`${totalLifts}`} colors={colors} />
                  <HistoryStat label="Carico massimo" value={formatMetric(maxWeight, unit)} colors={colors} />
                </View>
                <View style={[page.historyChartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={page.historySectionHeading}>
                    <Text style={[page.historySectionTitle, { color: colors.foreground }]}>Andamento carico</Text>
                    <Text style={[page.historyExerciseMeta, { color: colors.mutedForeground }]}>massimo per sessione</Text>
                  </View>
                  <View style={page.historyChart}>
                    {chartSessions.map((session, index) => (
                      <View key={session.id} style={page.historyChartColumn}>
                        <Text style={[page.historyChartValue, { color: colors.mutedForeground }]}>
                          {formatMetric(session.maxWeight, unit)}
                        </Text>
                        <View style={page.historyChartTrack}>
                          <View
                            style={[
                              page.historyChartBar,
                              {
                                height: Math.max(8, (session.maxWeight / chartMax) * 82),
                                backgroundColor: index === chartSessions.length - 1 ? colors.primary : colors.muted,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[page.historyChartDate, { color: colors.mutedForeground }]}>
                          {formatItalianDate(session.completedOn)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={page.historyAllSessionsHeader}>
                  <Text style={[page.historySectionTitle, { color: colors.foreground }]}>Tutte le sessioni</Text>
                  <Text style={[page.historyExerciseMeta, { color: colors.mutedForeground }]}>più recenti prima</Text>
                </View>
                {[...sessions].reverse().map((session) => (
                  <View key={session.id} style={[page.historySessionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={page.historySessionHeader}>
                      <View>
                        <Text style={[page.historySessionDate, { color: colors.foreground }]}>{formatItalianDateLong(session.completedOn)}</Text>
                        <Text style={[page.historyExerciseMeta, { color: colors.mutedForeground }]}>
                          {session.sets.length} {session.sets.length === 1 ? 'serie' : 'serie'} · volume {Math.round(session.volume).toLocaleString('it-IT')} {unit}
                        </Text>
                      </View>
                      <View style={[page.historySessionBadge, { backgroundColor: colors.accent }]}>
                        <Text style={[page.historySessionBadgeText, { color: colors.primary }]}>MAX {formatMetric(session.maxWeight, unit)}</Text>
                      </View>
                    </View>
                    {session.sets.map((set) => (
                      <View key={`${session.id}-${set.setIndex}`} style={[page.historyLiftRow, { backgroundColor: colors.surface2 }]}>
                        <Text style={[page.historyLiftSet, { color: colors.mutedForeground }]}>SET {set.setIndex + 1}</Text>
                        <Text style={[page.historyLiftValue, { color: colors.foreground }]}>{formatMetric(set.weight, unit)}</Text>
                        <Text style={[page.historyLiftMultiplier, { color: colors.mutedForeground }]}>×</Text>
                        <Text style={[page.historyLiftValue, { color: colors.foreground }]}>{set.reps} rip.</Text>
                        {session.estimatedOneRepMax !== null && set.reps <= 12 ? (
                          <Text style={[page.historyLiftEstimate, { color: colors.mutedForeground }]}>
                            ~{formatMetric(set.weight * (1 + set.reps / 30), unit)} 1RM
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
              </>
            ) : (
              <EmptyState
                title="Storico ancora vuoto"
                description="Completa una sessione con questo esercizio e i carichi inseriti: qui compariranno tutte le serie e il loro andamento."
              />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function HistoryStat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[page.historyStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[page.historyStatValue, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
      <Text style={[page.historyStatLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function SummaryCard({ icon, label, value, suffix, color }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; suffix: string; color: string }) {
  const colors = useColors();
  return <View style={[page.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[page.summaryIcon, { backgroundColor: `${color}22` }]}><Feather name={icon} size={16} color={color} /></View><Text style={[page.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text><Text style={[page.summaryValue, { color: colors.foreground }]}>{value}<Text style={[page.summarySuffix, { color: colors.mutedForeground }]}> {suffix}</Text></Text></View>;
}

function PrSummaryMetric({ label, value, color }: { label: string; value: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[page.prSummaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[page.prSummaryDot, { backgroundColor: color }]} />
      <Text style={[page.prSummaryValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[page.prSummaryLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function PersonalRecordCard({
  record,
  unit,
  today,
  colors,
}: {
  record: PersonalRecord;
  unit: 'kg' | 'lb';
  today: string;
  colors: ReturnType<typeof useColors>;
}) {
  const performance = {
    above: { label: 'SOPRA MEDIA', color: colors.success },
    balanced: { label: 'IN LINEA', color: colors.primary },
    below: { label: 'SOTTO MEDIA', color: colors.orange },
    insufficient: { label: 'DATI INSUFFICIENTI', color: colors.mutedForeground },
  }[record.performanceStatus];
  const balance = {
    above: { label: 'SOPRA MEDIA', color: colors.orange },
    balanced: { label: 'IN EQUILIBRIO', color: colors.success },
    below: { label: 'SOTTO MEDIA', color: colors.orange },
    unavailable: { label: 'NON CONFRONTABILE', color: colors.mutedForeground },
  }[record.balanceStatus];
  const daysAgo = Math.max(0, daysBetween(record.bestDate, today));
  const timeAgo = daysAgo === 0
    ? 'oggi'
    : daysAgo === 1
      ? 'ieri'
      : daysAgo < 7
        ? `${daysAgo} giorni fa`
        : daysAgo < 30
          ? `${Math.floor(daysAgo / 7)} sett. fa`
          : daysAgo < 365
            ? `${Math.floor(daysAgo / 30)} mesi fa`
            : `${Math.floor(daysAgo / 365)} anni fa`;
  const formatValue = (value: number) =>
    Number.isInteger(value)
      ? value.toLocaleString('it-IT')
      : Number(value.toFixed(1)).toLocaleString('it-IT');
  const previousSessionCount = Math.min(5, Math.max(0, record.sessionCount - 1));
  const balanceWidth = record.balanceRatio === null
    ? 0
    : Math.max(4, Math.min(100, (record.balanceRatio / 1.5) * 100));

  return (
    <View style={[page.prCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={page.prHeader}>
        <View style={[page.prIcon, { backgroundColor: colors.accent }]}>
          <Feather name="award" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[page.prExerciseName, { color: colors.foreground }]}>{record.exerciseName}</Text>
          <Text style={[page.prExerciseGroup, { color: colors.mutedForeground }]}>
            {record.group} · {record.sessionCount} {record.sessionCount === 1 ? 'sessione' : 'sessioni'}
          </Text>
        </View>
        <Pill tone="green">PR</Pill>
      </View>

      <View style={[page.prBestSet, { backgroundColor: colors.surface2 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[page.prEyebrow, { color: colors.mutedForeground }]}>CARICO MASSIMO</Text>
          <View style={page.prLoadRow}>
            <Text style={[page.prLoad, { color: colors.foreground }]}>{formatValue(record.bestWeight)}</Text>
            <Text style={[page.prLoadUnit, { color: colors.mutedForeground }]}>{unit}</Text>
            <View style={[page.prRepDivider, { backgroundColor: colors.border }]} />
            <Text style={[page.prReps, { color: colors.foreground }]}>{record.bestReps} rip.</Text>
          </View>
        </View>
        <View style={page.prDate}>
          <Feather name="calendar" size={13} color={colors.primary} />
          <Text style={[page.prDateText, { color: colors.foreground }]}>{timeAgo}</Text>
        </View>
      </View>
      <Text style={[page.prFullDate, { color: colors.mutedForeground }]}>
        Record ottenuto il {formatItalianDateLong(record.bestDate)}
      </Text>

      <View style={page.prStats}>
        <PrDetailStat
          label="1RM stimato"
          value={record.estimatedOneRepMax === null ? '—' : `~${formatValue(record.estimatedOneRepMax)} ${unit}`}
          colors={colors}
        />
        <PrDetailStat
          label="Volume nella sessione PR"
          value={`${Math.round(record.bestSessionVolume).toLocaleString('it-IT')} ${unit}`}
          colors={colors}
        />
      </View>

      <View style={[page.prInsight, { backgroundColor: colors.surface2 }]}>
        <View style={page.prInsightHeader}>
          <Text style={[page.prInsightTitle, { color: colors.foreground }]}>ANDAMENTO PERSONALE</Text>
          <View style={[page.prBadge, { backgroundColor: `${performance.color}20` }]}>
            <Text style={[page.prBadgeText, { color: performance.color }]}>{performance.label}</Text>
          </View>
        </View>
        {record.averagePreviousVolume === null || record.performanceChangePercent === null ? (
          <Text style={[page.prInsightCopy, { color: colors.mutedForeground }]}>
            Servono almeno due sessioni registrate per confrontare il volume con la tua media.
          </Text>
        ) : (
          <>
            <View style={page.prTrendRow}>
              <Text style={[page.prTrendValue, { color: record.performanceChangePercent >= 0 ? colors.success : colors.orange }]}>
                {record.performanceChangePercent > 0 ? '+' : ''}{Math.round(record.performanceChangePercent)}%
              </Text>
              <Text style={[page.prTrendDescription, { color: colors.mutedForeground }]}>
                ultima sessione rispetto alla media delle {previousSessionCount} precedenti
              </Text>
            </View>
            <Text style={[page.prInsightCopy, { color: colors.mutedForeground }]}>
              {Math.round(record.latestVolume).toLocaleString('it-IT')} {unit} ora · media {Math.round(record.averagePreviousVolume).toLocaleString('it-IT')} {unit}
              {' · '}{formatItalianDate(record.latestDate)}
            </Text>
          </>
        )}
      </View>

      <View style={[page.prBalance, { backgroundColor: colors.surface2 }]}>
        <View style={page.prInsightHeader}>
          <Text style={[page.prInsightTitle, { color: colors.foreground }]}>EQUILIBRIO NEL PROGRAMMA</Text>
          <View style={[page.prBadge, { backgroundColor: `${balance.color}20` }]}>
            <Text style={[page.prBadgeText, { color: balance.color }]}>{balance.label}</Text>
          </View>
        </View>
        {record.balanceRatio === null || record.averageGroupWeeklySets === null ? (
          <Text style={[page.prInsightCopy, { color: colors.mutedForeground }]}>
            Aggiungi più gruppi muscolari al programma per confrontare la distribuzione delle serie.
          </Text>
        ) : (
          <>
            <View style={page.prBalanceLabels}>
              <Text style={[page.prInsightCopy, { color: colors.mutedForeground }]}>
                {record.group}: {record.plannedWeeklySets} serie/settimana
              </Text>
              <Text style={[page.prBalanceRatio, { color: balance.color }]}>
                {Math.round(record.balanceRatio * 100)}% della media
              </Text>
            </View>
            <View style={[page.prBalanceTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  page.prBalanceFill,
                  { width: `${balanceWidth}%`, backgroundColor: balance.color },
                ]}
              />
            </View>
            <Text style={[page.prInsightCopy, { color: colors.mutedForeground }]}>
              Media degli altri gruppi: {formatValue(record.averageGroupWeeklySets)} serie/settimana.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function PrDetailStat({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[page.prDetailStat, { backgroundColor: colors.surface2 }]}>
      <Text style={[page.prDetailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[page.prDetailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const page = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 18 },
  summaryGrid: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, minHeight: 124, borderWidth: 1, borderRadius: 20, padding: 13 },
  summaryIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  summaryLabel: { fontSize: 11, fontWeight: '700' },
  summaryValue: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  summarySuffix: { fontSize: 10, fontWeight: '700' },
  chartCard: { borderRadius: 22, borderWidth: 1, padding: 16, minHeight: 205 },
  barChart: { height: 165, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: 10 },
  barItem: { alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 8 },
  barValueWrap: { height: 145, justifyContent: 'flex-end', alignItems: 'center', gap: 5 },
  barValue: { fontSize: 9, fontWeight: '700' },
  bar: { width: 30, borderRadius: 10 },
  barLabel: { fontSize: 10, fontWeight: '700' },
  segmented: { borderRadius: 14, padding: 4, flexDirection: 'row', marginBottom: 11 },
  segment: { flex: 1, paddingVertical: 9, textAlign: 'center', borderRadius: 10, fontSize: 11, fontWeight: '800' },
  progressCard: { borderRadius: 22, borderWidth: 1, padding: 17 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseDot: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  progressTitle: { fontSize: 15, fontWeight: '800' },
  progressSubtitle: { fontSize: 11, marginTop: 3 },
  progressMetric: { fontSize: 13, fontWeight: '900' },
  trendBars: { height: 148, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 4, marginTop: 16 },
  trendColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  trendValue: { height: 12, fontSize: 8, fontWeight: '800', textAlign: 'center' },
  trendBarTrack: { height: 105, width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  trendBar: { width: 19, maxWidth: '75%', borderRadius: 7 },
  trendDate: { fontSize: 8, fontWeight: '700', textAlign: 'center' },
  sectionHint: { fontSize: 11, fontWeight: '700' },
  detailCard: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  cycleBlock: { borderBottomWidth: 1 },
  cycleHeader: { minHeight: 68, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cycleDot: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cycleDotText: { fontSize: 12, fontWeight: '900' },
  cycleName: { fontSize: 14, fontWeight: '900' },
  cycleMeta: { fontSize: 11, marginTop: 3 },
  cycleContent: { paddingHorizontal: 13 },
  detailDay: { borderTopWidth: 1 },
  detailDayHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailDayTitle: { fontSize: 13, fontWeight: '800' },
  detailDayMeta: { fontSize: 11, marginTop: 3 },
  exerciseDetails: { paddingBottom: 12 },
  exerciseDetail: { marginBottom: 12 },
  exerciseDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  exerciseDetailName: { fontSize: 12, fontWeight: '800' },
  exerciseDetailGroup: { fontSize: 10 },
  historySetRow: { minHeight: 32, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, marginBottom: 4 },
  historySetNumber: { width: 22, fontSize: 11, fontWeight: '800' },
  historySetValue: { flex: 1, fontSize: 12, fontWeight: '700' },
  historySetSeparator: { fontSize: 12, paddingHorizontal: 8 },
  prSummaryGrid: { flexDirection: 'row', gap: 7, marginBottom: 5 },
  prSummaryCard: { flex: 1, minHeight: 78, borderWidth: 1, borderRadius: 16, padding: 11 },
  prSummaryDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 7 },
  prSummaryValue: { fontSize: 19, fontWeight: '900' },
  prSummaryLabel: { fontSize: 9, fontWeight: '700', marginTop: 3 },
  prIntro: { fontSize: 11, lineHeight: 16, marginTop: 5, marginBottom: 10 },
  prCard: { borderWidth: 1, borderRadius: 22, padding: 13, marginBottom: 10 },
  prHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  prIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  prExerciseName: { fontSize: 15, fontWeight: '900' },
  prExerciseGroup: { fontSize: 10, fontWeight: '600', marginTop: 3 },
  prBestSet: { borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  prEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  prLoadRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 3 },
  prLoad: { fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  prLoadUnit: { fontSize: 12, fontWeight: '800' },
  prRepDivider: { width: 1, height: 17, marginHorizontal: 4 },
  prReps: { fontSize: 14, fontWeight: '800' },
  prDate: { alignItems: 'center', gap: 4, minWidth: 50 },
  prDateText: { fontSize: 10, fontWeight: '800' },
  prFullDate: { fontSize: 10, marginTop: 6, marginBottom: 2 },
  prStats: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 11 },
  prDetailStat: { flex: 1, minHeight: 56, borderRadius: 13, padding: 10, backgroundColor: 'transparent' },
  prDetailLabel: { fontSize: 9, fontWeight: '700', lineHeight: 13 },
  prDetailValue: { fontSize: 12, fontWeight: '900', marginTop: 4 },
  prInsight: { borderRadius: 15, padding: 12 },
  prInsightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  prInsightTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  prBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99 },
  prBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.2 },
  prTrendRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  prTrendValue: { fontSize: 20, fontWeight: '900' },
  prTrendDescription: { flex: 1, fontSize: 10, lineHeight: 14 },
  prInsightCopy: { fontSize: 10, lineHeight: 15, marginTop: 6 },
  prBalance: { borderRadius: 15, padding: 12, marginTop: 9 },
  prBalanceLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 },
  prBalanceRatio: { fontSize: 9, fontWeight: '900' },
  prBalanceTrack: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: 8 },
  prBalanceFill: { height: '100%', borderRadius: 99 },
  prInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 15, marginTop: 9, marginBottom: 6 },
  prInfoText: { flex: 1, fontSize: 10, lineHeight: 15 },
  exerciseHistoryList: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 13 },
  exerciseHistoryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  exerciseHistoryLastRow: { borderBottomWidth: 0 },
  historyExerciseIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyExerciseName: { fontSize: 13, fontWeight: '800' },
  historyExerciseMeta: { fontSize: 10, lineHeight: 14, marginTop: 3 },
  historyExerciseLatest: { alignItems: 'flex-end', maxWidth: 112 },
  historyExerciseLoad: { fontSize: 12, fontWeight: '900' },
  historyOverlay: { flex: 1, justifyContent: 'flex-end' },
  historyModal: { maxHeight: '94%', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, paddingHorizontal: 17 },
  modalHandle: { width: 38, height: 4, borderRadius: 99, alignSelf: 'center', marginBottom: 17 },
  historyModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  historyModalEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 4 },
  historyModalTitle: { fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.5 },
  historyClose: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  historyModalContent: { paddingBottom: 16, gap: 11 },
  historyStats: { flexDirection: 'row', gap: 7 },
  historyStat: { flex: 1, minHeight: 68, borderWidth: 1, borderRadius: 14, padding: 10, justifyContent: 'center' },
  historyStatValue: { fontSize: 15, fontWeight: '900' },
  historyStatLabel: { fontSize: 9, fontWeight: '700', marginTop: 4 },
  historyChartCard: { borderWidth: 1, borderRadius: 19, padding: 14 },
  historySectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  historySectionTitle: { fontSize: 15, fontWeight: '900' },
  historyChart: { height: 135, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 5, marginTop: 12 },
  historyChartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 5 },
  historyChartValue: { fontSize: 8, fontWeight: '800', textAlign: 'center' },
  historyChartTrack: { height: 84, width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  historyChartBar: { width: 20, maxWidth: '72%', borderRadius: 7 },
  historyChartDate: { fontSize: 8, fontWeight: '700', textAlign: 'center' },
  historyAllSessionsHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 5 },
  historySessionCard: { borderWidth: 1, borderRadius: 17, padding: 11 },
  historySessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  historySessionDate: { fontSize: 12, fontWeight: '900' },
  historySessionBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 6 },
  historySessionBadgeText: { fontSize: 8, fontWeight: '900' },
  historyLiftRow: { minHeight: 35, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, marginTop: 4 },
  historyLiftSet: { width: 39, fontSize: 8, fontWeight: '900' },
  historyLiftValue: { minWidth: 52, fontSize: 11, fontWeight: '800' },
  historyLiftMultiplier: { fontSize: 11, fontWeight: '800' },
  historyLiftEstimate: { flex: 1, fontSize: 8, textAlign: 'right' },
  muscleCard: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 16 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muscleName: { fontSize: 13, fontWeight: '800', marginBottom: 7 },
  muscleTrack: { height: 7, borderRadius: 7, overflow: 'hidden' },
  muscleFill: { height: 7, borderRadius: 7 },
  muscleValue: { fontSize: 12, fontWeight: '800', width: 35, textAlign: 'right' },
  muscleEmpty: { fontSize: 12, lineHeight: 18 },
});